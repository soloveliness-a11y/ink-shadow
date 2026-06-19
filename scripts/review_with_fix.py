#!/usr/bin/env python3
"""
review_with_fix.py —— OCR 转换质量校验 + 自动修复。

工作流
------
1. PaddleOCR:扫描图(jpg)→ md/.raw/<章节>_<条目>_<序号>_<原文件名>/doc_<页>.md
2. 本脚本:调用本机 mimo CLI(xiaomi/mimo-v2.5 视觉能力),逐页核验 OCR 质量
3. 自动修复发现的差异
4. 修复后验证
5. 生成详细报告

用法
----
  python3 scripts/review_with_fix.py "豪门系列/11-水袖情（6人）"
  python3 scripts/review_with_fix.py "豪门系列/11-水袖情（6人）" --fix
  python3 scripts/review_with_fix.py "豪门系列/11-水袖情（6人）" --fix --verify
  python3 scripts/review_with_fix.py "豪门系列/11-水袖情（6人）" --report

退出码:全部一致 0;有差异 1;运行错误 2。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

# ─── 配置 ───

DEFAULT_MODEL = "xiaomi/mimo-v2.5"
# mimo CLI 默认装在 npm-global;若不在 PATH,补上常见位置
MIMO_BIN_CANDIDATES = [
    shutil.which("mimo"),
    str(Path.home() / ".npm-global/bin/mimo"),
    "/usr/local/bin/mimo",
    "/opt/homebrew/bin/mimo",
]

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# 章节 → (raw 目录名前缀, 原图子目录) 的映射
# raw 目录命名:<前缀>_...,如 "游戏说明_..." / "角色_..." / "线索_..." / "回忆_..."
SECTION_IMG_DIR = {
    "游戏说明": "游戏说明、真相",
    "角色": "人物剧本",
    "线索": "线索",
    "回忆": "回忆",
}

# 支持多种目录结构
SUPPORTED_IMG_DIRS = ["人物剧本", "剧本", "人", "线索", "回忆", "游戏说明、真相", "游说明书", "1.剧本"]

# 支持的角色目录名映射
ROLE_DIR_MAPPING = {
    "角色": "人物剧本",
    "人": "人",
}

# 支持多种目录结构
SUPPORTED_IMG_DIRS = ["人物剧本", "剧本", "人", "线索", "回忆", "游戏说明、真相", "游说明书", "1.剧本"]


# ─── 数据结构 ───

@dataclass
class DocPage:
    """一个待核验单位:单个 doc_<页>.md 及其源图。"""
    raw_dir: Path          # md/.raw/<章节>_<条目>_<序号>_<原文件名>/
    page: int              # doc_<页>.md 的页号
    md: Path               # 该页的 md 文件
    image: Path            # 源图(整张图;多页共享同一张图)
    label: str             # 报告里的标识,如 "角色_01姬霞_p2"


@dataclass
class Diff:
    """一个差异条目。"""
    location: str          # 位置信息
    original: str          # 原图原文
    recognized: str        # OCR识别文
    line: str              # 原始差异行


@dataclass
class ReviewResult:
    page: DocPage
    consistent: bool       # 一致 / 有差异
    diffs: list[Diff] = field(default_factory=list)  # 差异条目
    note: str = ""         # TIMEOUT / 风控等运行备注
    fixed: bool = False    # 是否已修复
    fixed_count: int = 0   # 修复数量
    verified: bool = False # 是否已验证


# ─── 工具 ───

def find_mimo() -> str:
    for cand in MIMO_BIN_CANDIDATES:
        if cand and Path(cand).exists():
            return cand
    sys.exit("✗ 找不到 mimo CLI。请先 `npm i -g @mimo-ai/cli` 并 `mimo providers` 配置账号。")


def collect_pages(script_dir: Path) -> list[DocPage]:
    """
    扫描 md/.raw/,把每个 doc_<页>.md 与其源图配对。
    raw 目录命名:<章节>_<条目>_<序号>_<原文件名>,最后一段是原图文件名(去扩展名)。
    """
    raw_root = script_dir / "md" / ".raw"
    if not raw_root.is_dir():
        sys.exit(f"✗ 找不到 OCR 原始输出目录: {raw_root}\n"
                 f"  请先跑 PaddleOCR 生成 md/.raw/。")

    # 先建「原图名 → 路径」索引,供 raw 目录按其末段名查图
    # 人物剧本是二级目录(人物剧本/01姬霞/姬霞01.jpg),故递归扫描
    img_index: dict[str, Path] = {}  # key = normalize(去扩展名的图名)
    for img_sub in SECTION_IMG_DIR.values():
        sub = script_dir / img_sub
        if not sub.is_dir():
            continue
        for img in sub.rglob("*"):
            if img.is_file() and img.suffix.lower() in IMG_EXTS:
                img_index[norm(img.stem)] = img
                img_index[norm(img.name)] = img  # 带扩展名也存一份,提高命中率

    # 支持多种目录结构
    for img_sub in SUPPORTED_IMG_DIRS:
        sub = script_dir / img_sub
        if not sub.is_dir():
            continue
        for img in sub.rglob("*"):
            if img.is_file() and img.suffix.lower() in IMG_EXTS:
                img_index[norm(img.stem)] = img
                img_index[norm(img.name)] = img

    # 支持 PDF 文件
    for pdf_file in script_dir.glob("*.pdf"):
        img_index[norm(pdf_file.stem)] = pdf_file
        img_index[norm(pdf_file.name)] = pdf_file

    # 支持子目录中的 PDF 文件
    for sub_dir in script_dir.iterdir():
        if sub_dir.is_dir():
            for pdf_file in sub_dir.glob("*.pdf"):
                img_index[norm(pdf_file.stem)] = pdf_file
                img_index[norm(pdf_file.name)] = pdf_file
            # 支持嵌套目录（如25-复泉楼/25-复泉楼/剧本/）
            for nested_dir in sub_dir.iterdir():
                if nested_dir.is_dir():
                    for pdf_file in nested_dir.glob("*.pdf"):
                        img_index[norm(pdf_file.stem)] = pdf_file
                        img_index[norm(pdf_file.name)] = pdf_file

    pages: list[DocPage] = []
    for raw_dir in sorted(raw_root.iterdir()):
        if not raw_dir.is_dir() or raw_dir.name.startswith("_"):
            continue
        # raw 目录名:<章节>_<条目>_<序号>_<原文件名/角色名>
        # 或者直接是角色名（如"如娅"、"忱纱"等）
        parts = raw_dir.name.rsplit("_", 3)
        if len(parts) >= 4:
            section_prefix = parts[0]
            origin_name = parts[-1]
        else:
            # 新格式：直接是角色名
            section_prefix = "角色"
            origin_name = raw_dir.name

        # 该 raw 目录下的每个 doc_<页>.md 都是一个核验单位
        for doc in sorted(raw_dir.glob("doc_*.md"), key=doc_sort_key):
            page = int(re.search(r"\d+", doc.stem).group())
            image = find_source_image(img_index, section_prefix, origin_name, page, script_dir)
            label = f"{raw_dir.name}_p{page}"
            pages.append(DocPage(raw_dir=raw_dir, page=page, md=doc, image=image, label=label))

    return pages


def find_source_image(
    img_index: dict[str, Path],
    section: str,
    origin_name: str,
    page: int,
    script_dir: Path,
) -> Path | None:
    """
    为单个 doc 页定位源图。匹配优先级:
      1. 精确:<origin_name> (如 origin=线索01反 → 线索01反.jpg,多页共享一图)
      2. 按页号:<origin_name>0<page> / <origin_name><page> (如 角色 姬霞 + p2 → 姬霞02.jpg)
      3. 包含:图名含 origin_name (容错)
    """
    # 1. 精确(整张图共享,如线索/回忆/游戏说明)
    exact = img_index.get(norm(origin_name))
    if exact:
        return exact

    # 2. 按页号(角色本:一张图一页,图名带页号)
    for candidate in (f"{origin_name}{page:02d}", f"{origin_name}{page}",
                      f"{origin_name}0{page}", f"{origin_name}_{page:02d}"):
        hit = img_index.get(norm(candidate))
        if hit:
            return hit

    # 3. 包含(在该章节子目录里找含 origin_name 的图,取第 page 张)
    # 支持多种目录结构
    for role_dir_name in ROLE_DIR_MAPPING.values():
        img_sub = role_dir_name
        sub = script_dir / img_sub
        if sub.is_dir():
            # 尝试在子目录中查找
            # 新格式：子目录名是角色名，文件名是 001.jpg、002.jpg 等
            role_dir = sub / origin_name
            if role_dir.is_dir():
                # 查找该目录下的所有图片
                matches = sorted(
                    img for img in role_dir.iterdir()
                    if img.is_file() and img.suffix.lower() in IMG_EXTS
                )
                if matches:
                    # 按页号取第 page 张(1-based);越界则取最后一张
                    return matches[min(page - 1, len(matches) - 1)]

            # 旧格式：图名含 origin_name
            matches = sorted(
                img for img in sub.rglob("*")
                if img.is_file() and img.suffix.lower() in IMG_EXTS
                and norm(origin_name) in norm(img.stem)
            )
            if matches:
                # 多张时按页号取第 page 张(1-based);越界则取最后一张
                return matches[min(page - 1, len(matches) - 1)]

            # 支持 PDF 文件
            pdf_matches = sorted(
                pdf for pdf in sub.rglob("*.pdf")
                if norm(origin_name) in norm(pdf.stem)
            )
            if pdf_matches:
                return pdf_matches[0]

    # 4. 在"剧本"目录下查找
    script_sub = script_dir / "剧本"
    if script_sub.is_dir():
        # 尝试在子目录中查找
        role_dir = script_sub / origin_name
        if role_dir.is_dir():
            matches = sorted(
                img for img in role_dir.iterdir()
                if img.is_file() and img.suffix.lower() in IMG_EXTS
            )
            if matches:
                return matches[min(page - 1, len(matches) - 1)]

    # 5. 在"1.剧本"目录下查找
    script_sub = script_dir / "1.剧本"
    if script_sub.is_dir():
        # 尝试在子目录中查找
        role_dir = script_sub / origin_name
        if role_dir.is_dir():
            matches = sorted(
                img for img in role_dir.iterdir()
                if img.is_file() and img.suffix.lower() in IMG_EXTS
            )
            if matches:
                return matches[min(page - 1, len(matches) - 1)]
    return None


def norm(s: str) -> str:
    """归一化:去空格/标点/扩展名,转小写,用于模糊匹配。"""
    s = re.sub(r"[\s\-_（）()【】[\].、，,·]", "", s)
    return s.lower()


def doc_sort_key(p: Path) -> tuple:
    m = re.search(r"(\d+)", p.stem)
    return (int(m.group()) if m else 0,)


# ─── 核心:调用 mimo 核验 ───

REVIEW_PROMPT = """你是一名严谨的 OCR 质量审核员。我会给你一张扫描原图和该图对应某一页的 OCR 识别文本(Markdown)。
请仔细比对两者,核验 OCR 质量,重点检查:漏字、错字(形近/同音)、错位/乱序、多字、格式丢失。

输出要求(严格遵守):
- 若完全一致,只输出一行:`VERDICT: OK`
- 若有差异,第一行 `VERDICT: ISSUES`,后续每行一条差异,格式:
  `[位置]原图「原文」→识别「识别文」`
  位置尽量具体(如「第2段第3行」「标题」「右上角」)。
- 只报客观差异,不要主观评价、不要复述全文、不要寒暄。"""


def run_mimo_review(page: DocPage, mimo: str, model: str, timeout: int) -> ReviewResult:
    """对单个 doc 页调用 mimo run,解析结果。"""
    if page.image is None:
        return ReviewResult(page=page, consistent=False,
                            note="无源图(配对失败)", diffs=[])

    # 注意参数顺序:message 必须在 -f 之前 —— mimo 的 yargs 会把 -f 之后的位置参数
    # 也当成文件,导致 "File not found: <prompt>"。故 prompt 放最前,-f 随后。
    cmd = [
        mimo, "run",
        "--model", model,
        "--format", "json",
        "--dangerously-skip-permissions",
        REVIEW_PROMPT,
        "-f", str(page.image),
        "-f", str(page.md),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return ReviewResult(page=page, consistent=False, note="TIMEOUT")
    except Exception as e:
        return ReviewResult(page=page, consistent=False, note=f"调用异常: {e}")

    if proc.returncode != 0:
        err = proc.stderr.strip()[:300] or proc.stdout.strip()[:300]
        # mimo/模型侧风控等,原报告里出现过 "The request was rejected because it was considered high risk"
        return ReviewResult(page=page, consistent=False, note=err)

    return parse_mimo_output(page, proc.stdout)


def parse_mimo_output(page: DocPage, stdout: str) -> ReviewResult:
    """解析 mimo run --format json 输出,提取 verdict 与差异清单。

    JSON 事件流结构(每行一个 JSON):
      {"type":"text","part":{"type":"text","text":"VERDICT: ISSUES\\n[位置]原图「…」→识别「…」"}}
    真正的回复文本在 part.text(不是外层的 type 字段)。
    """
    text = ""
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            evt = json.loads(line)
        except json.JSONDecodeError:
            continue
        # 只要 text 类型的 part(跳过 tool_use/step_start 等噪音)
        if evt.get("type") != "text":
            continue
        part = evt.get("part") or {}
        chunk = part.get("text")
        if isinstance(chunk, str):
            text += chunk

    verdict_ok = False
    diffs: list[Diff] = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        # 检查是否是"OK"或"一致"等表示无差异的标记
        if s.upper() in ("OK", "VERDICT: OK", "一致", "无差异", "没有错字", "无错字"):
            verdict_ok = True
        elif s.upper().startswith("VERDICT:"):
            verdict_ok = "OK" in s.upper() and "ISSUES" not in s.upper()
        elif "→" in s and ("原图" in s or "识别" in s or "[" in s):
            # 差异行:[位置]原图「…」→识别「…」(位置后可能有空格)
            diff = parse_diff_line(s)
            if diff:
                diffs.append(diff)
        elif "错字" in s or "漏字" in s or "多字" in s:
            # 可能是差异描述，但不是标准格式
            diffs.append(Diff(
                location="",
                original="",
                recognized="",
                line=s
            ))
    return ReviewResult(page=page, consistent=verdict_ok and not diffs, diffs=diffs)


def parse_diff_line(line: str) -> Diff | None:
    """解析差异行,提取原文和识别文。

    格式:[位置]原图「原文」→识别「识别文」
    """
    # 提取位置信息
    location_match = re.match(r'\[([^\]]+)\]', line)
    location = location_match.group(1) if location_match else ""

    # 提取原文和识别文
    # 格式:原图「原文」→识别「识别文」
    match = re.search(r'原图「([^」]*)」→识别「([^」]*)」', line)
    if not match:
        # 尝试其他格式
        match = re.search(r'「([^」]*)」→「([^」]*)」', line)
        if not match:
            return None

    original = match.group(1)
    recognized = match.group(2)

    return Diff(
        location=location,
        original=original,
        recognized=recognized,
        line=line
    )


# ─── 修复逻辑 ───

def fix_diff(page: DocPage, diff: Diff) -> bool:
    """修复单个差异。"""
    try:
        content = page.md.read_text(encoding="utf-8")
        if diff.original in content:
            new_content = content.replace(diff.original, diff.recognized, 1)
            page.md.write_text(new_content, encoding="utf-8")
            return True
        else:
            # 尝试模糊匹配
            # 移除空格和标点后匹配
            clean_original = re.sub(r'\s+', '', diff.original)
            clean_content = re.sub(r'\s+', '', content)
            if clean_original in clean_content:
                # 找到模糊匹配,但无法精确定位,跳过
                return False
            return False
    except Exception as e:
        print(f"  ⚠️ 修复失败: {e}")
        return False


def fix_page_diffs(page: DocPage, diffs: list[Diff]) -> tuple[int, int]:
    """修复一页的所有差异。返回 (成功数, 总数)。"""
    success_count = 0
    for diff in diffs:
        if fix_diff(page, diff):
            success_count += 1
            print(f"    ✓ 修复: 「{diff.original}」→「{diff.recognized}」")
        else:
            print(f"    ✗ 修复失败: 「{diff.original}」→「{diff.recognized}」")
    return success_count, len(diffs)


# ─── 验证逻辑 ───

def verify_page(page: DocPage, mimo: str, model: str, timeout: int) -> bool:
    """验证一页是否修复成功。"""
    result = run_mimo_review(page, mimo, model, timeout)
    return result.consistent


# ─── 报告(与历史格式同构) ───

def write_report(script_dir: Path, results: list[ReviewResult], elapsed: float, resume_cache: Path) -> None:
    report_dir = script_dir / "md" / ".raw" / "_review"
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / "_report.md"

    total = len(results)
    consistent = sum(1 for r in results if r.consistent)
    diff_count = total - consistent
    fixed_count = sum(1 for r in results if r.fixed)
    verified_count = sum(1 for r in results if r.verified)

    lines = [f"# 复核报告 · {script_dir.name}\n"]
    lines.append(f"总页数 {total},一致 {consistent},有差异 {diff_count}")
    lines.append(f"已修复 {fixed_count},已验证 {verified_count}")
    lines.append(f"耗时 {int(elapsed)}s\n")

    diff_results = [r for r in results if not r.consistent]
    if diff_results:
        lines.append("## 有差异的页\n")
        for r in diff_results:
            lines.append(f"### {r.page.label}")
            if r.note:
                lines.append(r.note)
            for d in r.diffs:
                status = "✓" if r.fixed else "✗"
                lines.append(f"{status} {d.line}")
            lines.append("")

    # 写入前先备份历史报告(防止覆盖丢失上一轮核验数据)
    if report_path.exists() and report_path.stat().st_size > 0:
        backup = report_path.with_name(f"_report.{int(time.time())}.md")
        shutil.copy2(report_path, backup)
        print(f"💾 已备份历史报告 → {backup.name}")

    report_path.write_text("\n".join(lines), encoding="utf-8")

    # resume 缓存:已完成页 → verdict,供 --resume 跳过
    cache = {r.page.label: {"consistent": r.consistent, "diffs": [d.line for d in r.diffs], "note": r.note}
             for r in results if r.note != "TIMEOUT"}
    resume_cache.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


# ─── 主流程 ───

def main() -> int:
    ap = argparse.ArgumentParser(description="用 mimo-v2.5 视觉能力核验 PaddleOCR 转换质量 + 自动修复")
    ap.add_argument("script_dir", help="豪门剧本目录,如 '豪门系列/11-水袖情（6人）'")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"模型(默认 {DEFAULT_MODEL})")
    ap.add_argument("--jobs", type=int, default=3, help="并发数(默认 3)")
    ap.add_argument("--timeout", type=int, default=180, help="单页核验超时秒数(默认 180)")
    ap.add_argument("--fix", action="store_true", help="启用自动修复")
    ap.add_argument("--verify", action="store_true", help="修复后验证")
    ap.add_argument("--report", action="store_true", help="生成详细报告")
    ap.add_argument("--dry-run", action="store_true", help="只列配对,不调模型")
    ap.add_argument("--resume", action="store_true", help="跳过上次已完成(非超时)的页")
    args = ap.parse_args()

    mimo = find_mimo()
    script_dir = Path(args.script_dir)
    if not script_dir.is_dir():
        sys.exit(f"✗ 目录不存在: {script_dir}")

    pages = collect_pages(script_dir)
    if not pages:
        sys.exit(f"✗ 在 {script_dir}/md/.raw/ 未找到任何 doc_*.md")

    print(f"📜 {script_dir.name} · 共 {len(pages)} 页待核验 · 模型 {args.model}")

    # resume:加载缓存,跳过已完成页
    resume_cache = script_dir / "md" / ".raw" / "_review" / "_cache.json"
    done: dict[str, dict] = {}
    if args.resume and resume_cache.exists():
        try:
            done = json.loads(resume_cache.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            done = {}
        skipped = [p for p in pages if p.label in done]
        pages = [p for p in pages if p.label not in done]
        if skipped:
            print(f"⏭️  --resume 跳过已完成 {len(skipped)} 页,剩余 {len(pages)} 页")

    if args.dry_run:
        for p in pages:
            img_name = p.image.name if p.image else "❌ 无源图"
            print(f"  {p.label}  ←  {img_name}  /  {p.md.name}")
        return 0

    if not pages:
        print("✓ 全部页已核验完成(无新增)。报告见 md/.raw/_review/_report.md")
        return 0

    print(f"🚀 开始核验(并发 {args.jobs},超时 {args.timeout}s/页)...\n")
    start = time.time()
    results: list[ReviewResult] = []

    # 把 resume 缓存里已完成的结果也并回(用于报告统计)
    cached_results: list[ReviewResult] = []
    for label, info in done.items():
        # 重建 DocPage(仅用于报告展示,不再调模型)
        for p in [pp for pp in collect_pages(script_dir) if pp.label == label]:
            diffs = []
            for d_line in info.get("diffs", []):
                diff = parse_diff_line(d_line)
                if diff:
                    diffs.append(diff)
            cached_results.append(ReviewResult(
                page=p, consistent=info.get("consistent", False),
                diffs=diffs, note=info.get("note", ""),
            ))

    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(run_mimo_review, p, mimo, args.model, args.timeout): p for p in pages}
        for i, fut in enumerate(as_completed(futures), 1):
            res = fut.result()
            results.append(res)
            if res.consistent:
                print(f"  [{i}/{len(pages)}] ✅ {res.page.label}")
            elif res.note and not res.diffs:
                print(f"  [{i}/{len(pages)}] ❌ {res.page.label} — {res.note}")
            else:
                print(f"  [{i}/{len(pages)}] ⚠️  {res.page.label} — {len(res.diffs)} 处差异")

                # 自动修复
                if args.fix and res.diffs:
                    print(f"    🔧 修复中...")
                    success_count, total_count = fix_page_diffs(res.page, res.diffs)
                    res.fixed = success_count > 0
                    res.fixed_count = success_count
                    print(f"    📝 修复结果: {success_count}/{total_count}")

                    # 修复后验证
                    if args.verify and res.fixed:
                        print(f"    🔍 验证中...")
                        if verify_page(res.page, mimo, args.model, args.timeout):
                            res.verified = True
                            res.consistent = True
                            print(f"    ✅ 验证通过")
                        else:
                            print(f"    ❌ 验证失败")

    elapsed = time.time() - start
    all_results = cached_results + results
    write_report(script_dir, all_results, elapsed, resume_cache)

    consistent = sum(1 for r in all_results if r.consistent)
    diff_count = len(all_results) - consistent
    fixed_count = sum(1 for r in all_results if r.fixed)
    verified_count = sum(1 for r in all_results if r.verified)
    print(f"\n{'='*50}")
    print(f"✅ 一致 {consistent} · ⚠️ 有差异 {diff_count} · 🔧 已修复 {fixed_count} · 🔍 已验证 {verified_count} · 共 {len(all_results)} 页 · 耗时 {int(elapsed)}s")
    print(f"📄 报告: {script_dir}/md/.raw/_review/_report.md")
    return 0 if diff_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
