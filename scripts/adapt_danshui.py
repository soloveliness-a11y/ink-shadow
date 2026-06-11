#!/usr/bin/env python3
"""Convert Danshui Mountain Villa OCR data to system JSON format."""

import json
import os
import re
from pathlib import Path

BASE = Path("/Users/a1np/文档/Design/murder-mystery-game")
OCR = BASE / "豪门系列/1-丹水山庄（7人）/_ocr文本"
OUT = BASE / "content/danshui/script.json"

# ── helpers ──────────────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text)

def read_file(path: Path) -> str:
    if path.exists():
        return strip_html(path.read_text(encoding="utf-8")).strip()
    return ""

def read_all_files_in_dir(d: Path) -> dict[str, str]:
    """Read all .md files in a directory, return {filename: content}."""
    result = {}
    if not d.exists():
        return result
    for f in sorted(d.iterdir()):
        if f.suffix == ".md":
            result[f.name] = read_file(f)
    return result

def parse_sections(text: str) -> dict[str, str]:
    """Split markdown text by ## headers into {header: content}."""
    sections = {}
    current = "__preamble__"
    lines = []
    for line in text.split("\n"):
        m = re.match(r'^##\s+(.+)', line)
        if m:
            if lines:
                sections[current] = "\n".join(lines).strip()
            current = m.group(1).strip()
            lines = []
        else:
            lines.append(line)
    if lines:
        sections[current] = "\n".join(lines).strip()
    return sections

def extract_numbered_items(text: str) -> list[dict]:
    """Extract numbered items like '1、xxx（2分）' from text."""
    items = []
    for m in re.finditer(r'(\d+)[、.]\s*(.+?)(?:\n|$)', text):
        desc = m.group(2).strip()
        score_m = re.search(r'[（(](\d+)分[）)]', desc)
        score = int(score_m.group(1)) if score_m else None
        items.append({"description": desc, "scoring": score})
    return items

# ── character definitions ────────────────────────────────────────────────────

CHAR_DEFS = [
    {"id": "feng", "name": "冯双骥", "gender": "male", "age": 41, "isVictim": False, "isMurderer": True,
     "skills": ["武术", "冯竹的信任", "被动"],
     "visual_prompt": "Portrait of a stern middle-aged Chinese butler with greying hair, Republican era 1914, lean build, wearing traditional grey changshan, watchful eyes"},
    {"id": "yin", "name": "尹少鳴", "gender": "male", "age": 21, "isVictim": False, "isMurderer": False,
     "skills": ["武术", "药物"],
     "visual_prompt": "Portrait of a young Chinese man around 21, Republican era 1914, scholarly yet adventurous look, wearing a simple travel suit"},
    {"id": "wei", "name": "赵卫", "gender": "male", "age": 21, "isVictim": False, "isMurderer": False,
     "skills": ["赵家主人", "尊贵身份"],
     "visual_prompt": "Portrait of a pale young Chinese man around 21, Republican era 1914, reclusive and suspicious expression, traditional clothing"},
    {"id": "luoyi", "name": "赵洛意", "gender": "female", "age": 19, "isVictim": False, "isMurderer": False,
     "skills": ["赵家主人", "新闻", "被动"],
     "visual_prompt": "Portrait of a beautiful young Chinese woman around 19, Republican era 1914, progressive modern woman, determined expression, wearing a modest qipao"},
    {"id": "qiuer", "name": "赵秋儿", "gender": "female", "age": 16, "isVictim": False, "isMurderer": False,
     "skills": ["新闻", "恭维", "被动"],
     "visual_prompt": "Portrait of a young Chinese maid around 16, Republican era 1914, innocent and intelligent expression, wearing servant attire"},
    {"id": "guo", "name": "郭望山", "gender": "male", "age": 38, "isVictim": False, "isMurderer": False,
     "skills": ["恭维", "药物"],
     "visual_prompt": "Portrait of a middle-aged Chinese businessman around 38, Republican era 1914, confident and calculating expression, wearing a Western-style suit"},
    {"id": "qi", "name": "齐岳", "gender": "male", "age": 32, "isVictim": False, "isMurderer": False,
     "skills": ["武术", "冯竹的信任"],
     "visual_prompt": "Portrait of a sturdy Chinese man around 32, Republican era 1914, military bearing, bodyguard physique, wearing practical clothing"},
    {"id": "wanlei", "name": "赵万雷", "gender": "male", "age": 44, "isVictim": True, "isMurderer": False,
     "skills": [],
     "visual_prompt": "Portrait of a wealthy Chinese merchant around 44, Republican era 1914, opulent traditional clothing, stern face, memorial photo style"},
]

# ── parse characters ─────────────────────────────────────────────────────────

CHAR_DIRS = {
    "feng": "冯双骥",
    "yin": "尹少鳴",
    "wei": "赵卫",
    "luoyi": "赵洛意",
    "qiuer": "赵秋儿",
    "guo": "郭望山",
    "qi": "齐岳",
}

def parse_character_files(char_id: str) -> dict:
    """Parse all OCR files for a character into structured data."""
    dir_name = CHAR_DIRS[char_id]
    char_dir = OCR / "人" / dir_name
    files = read_all_files_in_dir(char_dir)

    # Combine all files in order
    ordered_files = []
    for key in sorted(files.keys(), key=lambda x: (x.isdigit(), x)):
        ordered_files.append(files[key])
    all_text = "\n\n".join(ordered_files)

    sections = parse_sections(all_text)

    # Extract sections
    backstory = ""
    today_story = ""
    known_others = ""
    social_content = ""
    performance = ""
    objectives_1_text = ""
    afternoon = ""
    investigation_intro = ""
    skills_text = ""
    objectives_2_text = ""
    endings_text = ""
    investigation_report = ""

    # Parse sections by name patterns
    for header, content in sections.items():
        h_lower = header.lower()
        if "人物故事" in header:
            backstory = content
        elif "今天的故事" in header or "今日" in header:
            today_story = content
        elif "你已经知道的其他人" in header or "知道的其他人" in header:
            known_others = content
        elif "饭后的寒暄" in header or "午饭时的寒暄" in header or "寒暄" in header:
            social_content = content
        elif "你的表现" in header:
            performance = content
        elif "你的目的（一）" in header or "目的（一）" in header:
            objectives_1_text = content
        elif "下午的活动" in header:
            afternoon = content
        elif "谁是真凶" in header:
            investigation_intro = content
        elif "你的技能" in header or "技能" in header:
            skills_text = content
        elif "你的目的（二）" in header or "目的（二）" in header:
            objectives_2_text = content
        elif "结局" in header:
            endings_text += "\n\n" + content if endings_text else content
        elif "调查报告" in header or "你知道吗" in header:
            investigation_report += "\n\n" + content if investigation_report else content

    # Build privateScript: 人物故事 + 今天的故事 + 你已经知道的其他人
    private_parts = []
    if backstory:
        private_parts.append(backstory)
    if today_story:
        private_parts.append("## 今天的故事\n\n" + today_story)
    if known_others:
        private_parts.append("## 你已经知道的其他人\n\n" + known_others)
    private_script = "\n\n".join(private_parts)

    # Build storyByPhase
    social_parts = []
    if social_content:
        social_parts.append(social_content)
    if performance:
        social_parts.append(performance)
    if objectives_1_text:
        social_parts.append("## 你的目的（一）\n\n" + objectives_1_text)

    investigation_parts = []
    if afternoon:
        investigation_parts.append(afternoon)
    if investigation_intro:
        investigation_parts.append(investigation_intro)
    if skills_text:
        investigation_parts.append(skills_text)
    if objectives_2_text:
        investigation_parts.append("## 你的目的（二）\n\n" + objectives_2_text)

    story_by_phase = {}
    if social_parts:
        story_by_phase["social"] = "\n\n".join(social_parts)
    if investigation_parts:
        story_by_phase["investigation"] = "\n\n".join(investigation_parts)

    # Extract objectives
    objectives = []
    obj_counter = 0
    for text, kind in [(objectives_1_text, "main"), (objectives_2_text, "hidden")]:
        items = extract_numbered_items(text)
        for i, item in enumerate(items):
            obj_counter += 1
            obj_kind = kind if len(items) == 1 else ("main" if i == 0 else "side")
            if kind == "hidden":
                obj_kind = "hidden"
            objectives.append({
                "id": f"o_{char_id}_{obj_counter}",
                "kind": obj_kind,
                "description": item["description"],
                **({"scoring": item["scoring"]} if item["scoring"] else {}),
            })

    # Extract skills from skills_text
    skills = []
    for m in re.finditer(r'【([^】]+)】', skills_text):
        skills.append(m.group(1))

    # Extract secrets from the script
    secrets = _extract_secrets(all_text, char_id)

    # Build timeline from afternoon activities
    timeline = _extract_timeline(afternoon)

    # Build relationships from known_others
    relationships = _extract_relationships(known_others, char_id)

    return {
        "private_script": private_script,
        "story_by_phase": story_by_phase,
        "objectives": objectives,
        "skills": skills,
        "secrets": secrets,
        "timeline": timeline,
        "relationships": relationships,
        "endings_text": endings_text,
        "investigation_report": investigation_report,
    }


def _extract_secrets(text: str, char_id: str) -> list[str]:
    """Extract secrets from character script content."""
    secrets = []
    # Common secret patterns
    patterns = [
        r'你(?:是|就是)(?:真凶|凶手)',
        r'你(?:杀了|毒杀了|害死了)',
        r'你(?:帮助过|隐瞒了|偷偷)',
        r'不要让.*?发现.*?你是',
        r'隐瞒.*?身份',
        r'千万不能被发现',
        r'你的身份',
        r'你和.*?的关系',
    ]
    # For now, return generic secrets based on known plot
    SECRET_MAP = {
        "feng": ["你是杀害赵万雷的真凶", "你用了夹竹桃毒杀赵万雷", "你一直在帮助黑狼会", "你是赵洛意的亲生父亲"],
        "yin": ["你是黑狼会派来的人", "你的真名叫虞北辰", "你绑架了赵洛意"],
        "wei": ["你相信自己是光绪皇帝的儿子", "你和赵万雷换了药", "你拿走了金龙刀"],
        "luoyi": ["你在回程中遇到了尹少鸣", "你在学校被误捕过", "你的母亲王郁与冯双骥的关系"],
        "qiuer": ["你可能是赵万雷的私生女", "你偷偷把糕饼送给了赵万雷", "你的长命锁是买来的"],
        "guo": ["你的矿产交易背后有日本势力", "你和花子狸有来往", "你的真实目的不是签合同"],
        "qi": ["你的真实身份是廖氏商行的人", "你曾被赵万雷派去调查爆炸案", "你和廖老板的关系"],
    }
    return SECRET_MAP.get(char_id, [])


def _extract_timeline(afternoon_text: str) -> list[dict]:
    """Extract timeline entries from afternoon activities text."""
    timeline = []
    # Match patterns like "13:00。" or "14：20。" or "15: 15:50。"
    for m in re.finditer(r'(\d{1,2})[：:](\d{2})[。\s](.+?)(?=(?:\d{1,2}[：:]\d{2}[。\s]|$))', afternoon_text, re.DOTALL):
        hour, minute, rest = m.group(1), m.group(2), m.group(3).strip()
        # Clean up the action text
        action = re.sub(r'\n+', ' ', rest).strip()
        # Truncate at next timestamp if captured too much
        action = re.split(r'\d{1,2}[：:]\d{2}[。\s]', action)[0].strip()
        if action:
            is_public = any(kw in action for kw in ["客厅", "大厅", "吃饭", "午饭", "迎接"])
            timeline.append({
                "time": f"{hour}:{minute}",
                "location": "山庄",
                "action": action[:200],
                "isPublic": is_public,
            })
    return timeline


def _extract_relationships(known_others_text: str, char_id: str) -> list[dict]:
    """Extract relationships from '你已经知道的其他人' section."""
    relationships = []
    # Map character names to IDs
    name_to_id = {
        "赵万雷": "wanlei", "李郁": "wanlei", "王郁": "wanlei",
        "赵卫": "wei", "赵洛意": "luoyi", "赵秋儿": "qiuer",
        "冯双骥": "feng", "冯竹": "feng",
        "齐岳": "qi", "尹少鸣": "yin", "尹少鳴": "yin",
        "郭望山": "guo", "郭阁山": "guo",
    }
    # Default relationships for known character pairs
    REL_DEFAULTS = {
        ("feng", "wanlei"): {"relation": "习武师兄，赵万雷对他非常信任，把家里大小事情都交给他处理", "isPublic": True},
        ("feng", "luoyi"): {"relation": "冯双骥是赵洛意的亲生父亲，一直暗中保护她", "isPublic": False},
        ("feng", "wei"): {"relation": "冯双骥编造了赵卫的身世故事，赵卫深信不疑", "isPublic": False},
        ("feng", "qiuer"): {"relation": "赵秋儿是赵洛意的贴身丫鬟，冯双骥对她印象不错", "isPublic": True},
        ("feng", "yin"): {"relation": "名义上的表外甥，实际是黑狼会派来的人", "isPublic": False},
        ("feng", "guo"): {"relation": "北京矿产商人，来拜访赵万雷签约", "isPublic": True},
        ("feng", "qi"): {"relation": "护院总管，冯双骥聘用的，负责山庄安全", "isPublic": True},
        ("yin", "luoyi"): {"relation": "在火车上救了被绑架的赵洛意，送她回家", "isPublic": False},
        ("yin", "feng"): {"relation": "名义上的表外甥，实际来调查冯双骥与黑狼会的关系", "isPublic": False},
        ("wei", "wanlei"): {"relation": "赵卫认为赵万雷是杀害母亲的仇人", "isPublic": False},
        ("wei", "feng"): {"relation": "冯双骥是唯一保护赵卫的人，赵卫信任他", "isPublic": True},
        ("wei", "luoyi"): {"relation": "同母异父的兄妹，关系疏远", "isPublic": False},
        ("luoyi", "wanlei"): {"relation": "父女关系，赵洛意是赵万雷最宠爱的女儿", "isPublic": True},
        ("luoyi", "wei"): {"relation": "同母异父的兄妹，赵洛意害怕赵卫的病发作", "isPublic": True},
        ("luoyi", "feng"): {"relation": "冯双骥从小照顾赵洛意，她非常信任他", "isPublic": True},
        ("luoyi", "qiuer"): {"relation": "贴身丫鬟，一起长大，如同姐妹", "isPublic": True},
        ("luoyi", "yin"): {"relation": "尹少鸣送她回家，她不知道他的真实身份", "isPublic": False},
        ("qiuer", "luoyi"): {"relation": "赵秋儿是赵洛意的贴身丫鬟，两人关系亲密如姐妹", "isPublic": True},
        ("qiuer", "wanlei"): {"relation": "赵万雷对赵秋儿有特殊关注", "isPublic": False},
        ("guo", "wanlei"): {"relation": "北京矿务总公司的总代理，来和赵万雷签约", "isPublic": True},
        ("guo", "feng"): {"relation": "矿产商人和管家的商务关系", "isPublic": True},
        ("qi", "feng"): {"relation": "护院总管被冯双骥聘用，两人关系信任", "isPublic": True},
        ("qi", "wanlei"): {"relation": "护院总管保护山庄安全", "isPublic": True},
    }
    for target_id in [c["id"] for c in CHAR_DEFS if c["id"] != char_id]:
        key = (char_id, target_id)
        if key in REL_DEFAULTS:
            rel = REL_DEFAULTS[key].copy()
            rel["targetCharId"] = target_id
            relationships.append(rel)
    return relationships


# ── parse clues ──────────────────────────────────────────────────────────────

SCENE_MAP = {
    "仆院、厨房": "s_servant",
    "内宅": "s_inner",
    "前院": "s_front",
    "后院": "s_back",
    "客房": "s_guest",
    "管家房": "s_butler",
    "赵万雷": "s_victim_room",
    "赵赵秋儿的房间": "s_qiuer_room",
}

SCENE_DEFS = [
    {"id": "s_servant", "name": "仆院与厨房", "description": "山庄的后勤区域，包括仆人住房和厨房。厨娘李姨在这里准备膳食，下人们在此进出。"},
    {"id": "s_inner", "name": "内宅", "description": "山庄的内部区域，包括账房和库房。宋群在此记账，吴老爹在此管理仓库。"},
    {"id": "s_front", "name": "前院", "description": "山庄的前院区域，包括大门、梧桐园和南方花园。花草繁茂，尤其是南方花园里种着各色奇花。"},
    {"id": "s_back", "name": "后院", "description": "山庄的后院区域，赵卫独居于此。偏僻安静，有一架长梯藏在树丛中。"},
    {"id": "s_guest", "name": "客房", "description": "山庄为客人准备的房间。尹少鸣和郭望山分别住在这里。"},
    {"id": "s_butler", "name": "管家房", "description": "冯双骥的房间。抽屉里有狼头纽扣和电报，墙上挂着一张合影。"},
    {"id": "s_victim_room", "name": "赵万雷卧室", "description": "赵万雷的卧室位于二楼。案发现场，地上有碎片和血迹，尸体胸口插着金龙刀。"},
    {"id": "s_qiuer_room", "name": "赵洛意与赵秋儿的房间", "description": "赵洛意和赵秋儿共用的房间。书架上有《巴黎茶花女遗事》，箱子里有干枯的花朵。"},
]

def parse_clues() -> list[dict]:
    """Parse all clue files into structured clue objects."""
    clues = []
    clue_counter = 0

    for dir_name, scene_id in SCENE_MAP.items():
        clue_dir = OCR / "线索" / dir_name
        files = read_all_files_in_dir(clue_dir)
        for fname, content in files.items():
            # Each content has multiple clue items separated by blank lines or bullets
            items = _parse_clue_items(content, scene_id, clue_counter)
            clue_counter += len(items)
            clues.extend(items)

    return clues


def _parse_clue_items(content: str, scene_id: str, start_id: int) -> list[dict]:
    """Parse individual clue items from a clue file content.

    The OCR text has each clue item on its own line, separated by blank lines.
    We need to reconstruct clue items by grouping related lines together.

    A clue item typically has:
    - A description of what was found/observed
    - A location where it was found
    - Optional: skill gate and secret clue reference
    """
    # Strip HTML tags first
    content = strip_html(content)

    # Split by blank lines to get raw segments
    raw_segments = re.split(r'\n\s*\n', content)

    # Filter out empty segments, image placeholders, and pure headers
    segments = []
    for seg in raw_segments:
        seg = seg.strip()
        if not seg:
            continue
        # Skip HTML image tags (should already be stripped, but just in case)
        if seg.startswith('<div') or seg.startswith('<img'):
            continue
        # Skip ## headers (location titles)
        if seg.startswith('##'):
            continue
        segments.append(seg)

    # Now group segments into clue items
    # A new clue starts when we see:
    # - A bold text (**...**)
    # - A segment that looks like a clue description (object, person, observation)
    # - A segment containing 「发现」or 「遇到」or 「看到」
    # A segment is a continuation if it's short (< 15 chars) or starts with continuation patterns

    clue_groups = []
    current_group = []

    for seg in segments:
        # Check if this starts a new clue
        is_new_clue = False
        if not current_group:
            is_new_clue = True
        elif seg.startswith('**'):
            is_new_clue = True
        elif len(seg) > 20 and not seg.startswith('可以去调查') and not seg.startswith('秘密线索'):
            # Substantial text that's not a continuation
            is_new_clue = True
        elif re.match(r'^(在|从|一把|一张|几|那个|这个)', seg):
            is_new_clue = True

        if is_new_clue:
            if current_group:
                clue_groups.append(current_group)
            current_group = [seg]
        else:
            current_group.append(seg)

    if current_group:
        clue_groups.append(current_group)

    # Build clue objects
    clues = []
    counter = start_id

    for group in clue_groups:
        # Join the group into a single clue content
        full_text = "\n".join(group)

        # Extract skill requirements
        required_skill = None
        skill_match = re.search(r'拥有【([^】]+)】技能的人可以去调查', full_text)
        if not skill_match:
            skill_match = re.search(r'【([^】]+)】可以去调查', full_text)
        if skill_match:
            required_skill = skill_match.group(1)

        # Extract linked secret clue
        linked_secret = None
        secret_match = re.search(r'秘密线索\s*(\d+)', full_text)
        if secret_match:
            linked_secret = f"sc_{secret_match.group(1).zfill(2)}"

        # Determine if this is a key clue
        is_key = any(kw in full_text for kw in ["金龙刀", "夹竹桃", "尸体", "血迹", "毒", "爆炸", "炸弹", "凶器", "血", "刀", "糕饼"])

        # Extract title from bold text or first line
        title_match = re.match(r'\*\*([^*]+)\*\*', full_text)
        if title_match:
            title = title_match.group(1).strip()
        else:
            # Take first line, remove leading patterns
            first_line = group[0]
            title = re.sub(r'^(在|从|一把|一张|几|那个|这个)', '', first_line).strip()
            title = re.split(r'[——：:。]', title)[0].strip()[:50]

        if not title or len(title) < 2:
            title = full_text[:30].replace("\n", " ").strip()
        title = re.sub(r'^#+\s*', '', title).strip()

        counter += 1
        clue_id = f"cl_{scene_id}_{counter:02d}"

        # Determine pointsTo
        points_to = []
        if "金龙刀" in full_text or "凶器" in full_text:
            points_to.append("murder_weapon")
        if "夹竹桃" in full_text or "毒" in full_text.lower():
            points_to.append("poison_method")
        if "尸体" in full_text or "死亡" in full_text:
            points_to.append("crime_scene")
        if "爆炸" in full_text or "炸弹" in full_text:
            points_to.append("bombing_history")

        # Determine ownership based on scene
        owner_char_id = None
        if scene_id == "s_butler":
            owner_char_id = "feng"
        elif scene_id == "s_back":
            owner_char_id = "wei"
        elif scene_id == "s_qiuer_room":
            owner_char_id = "luoyi"

        clues.append({
            "id": clue_id,
            "title": title[:80],
            "content": full_text,
            "sceneId": scene_id,
            **({"ownerCharId": owner_char_id} if owner_char_id else {}),
            "visibility": "searchable",
            "isKey": is_key,
            "pointsTo": points_to,
            **({"requiredSkill": required_skill} if required_skill else {}),
            **({"linkedSecretClueId": linked_secret} if linked_secret else {}),
        })

    return clues


def parse_secret_clues() -> list[dict]:
    """Parse secret clue files.

    Secret clue files use markers like **秘密线索NN** or **线索NN**.
    Items without such markers in file 1.md are treated as regular clues
    (not secret clues) and skipped here.
    """
    clues = []
    secret_dir = OCR / "秘密线索"
    files = read_all_files_in_dir(secret_dir)

    # Known secret clue numbers and their approximate content
    # The OCR files contain items 03-19 (some numbers may be missing)
    SECRET_KNOWN = {
        1: "赵万雷、唐茂光、虞北辰、任雪、孟深结社于天津——在收拾赵万雷的房间时发现了这个名单。",
        2: "狗闻了金龙刀刀柄之后就对着郭望山叫了起来。",
        3: "老爷曾让张盛去调查庚子年的那场爆炸。爆炸前绸缎铺掌柜收到字条写着「我要炸了这里」。",
        4: "1、2、3、4、6瓶子上写着帮助睡眠的药物，特别标出成分含有opium（鸦片）。",
        5: "治疗感冒着凉的常见药物——在赵卫的房间（后院）里发现。",
        6: "赵卫把赵万雷的药和自己的药对调了，他不知道自己才是离不开药的人。",
        7: "张唐小时候隔壁有一个叫鲁泰的大哥，鲁泰让他去给城里的绸缎铺送一个纸条，然后绸缎铺就着火了。",
        8: "老爷屋里有一把从天津带回来的金龙宝刀。少爷一直想要那把刀，老爷怕他伤人没给他。",
        9: "光绪二十六年庚子年，泽州本地一家绸缎铺被投放炸弹，炸死了进店妇女和仆人。",
        10: "冯竹听见父亲让赵安去上海接小姐回来，她去赵万雷卧室拿了一瓶安眠药交给赵安。",
        11: "黑狼会的传闻出现在十多年前，各地有很多爆炸案都跟他们有关，背后是日本人。",
        12: "张安曾被赵万雷派去北京拜访任师父，管家让他带了厚礼并转告任师父说他的大恩冯双骥一生不定。",
        13: "李姨说太太在过门前就有了心上人了，好像姓廖。赵家财大势大，李老爷把太太嫁到了泽州府。",
        14: "这种植物叫夹竹桃，叶、皮、根、花、种子都有剧毒。",
        15: "几年前一份报纸写过太原一个集团正在和赵家各地的代理人接洽，之后没有任何后续报导。",
        16: "卢强因为抽大烟把老家的家产都卖光了，来赵家后打算老老实实过日子，但烟瘾一上来就情绪混乱。",
        17: "吴老爹记得大小姐出生前一年，赵万雷从农历五月底带着冯双骥去天津花天酒地了三个月。",
        18: "唐茂光变卖家产筹集银两送给甲午战争阵亡将士家属，之后辞官归隐江南。",
        19: "你把糕饼喂给了家里养的狗，过了一会儿狗就死了。",
    }

    for num, content in sorted(SECRET_KNOWN.items()):
        clue_id = f"sc_{num:02d}"
        # Check if this clue requires a skill
        required_skill = None
        if num in (1,):
            required_skill = "赵家主人"
        elif num in (10,):
            required_skill = "冯竹的信任"
        elif num in (11,):
            required_skill = "新闻"
        elif num in (13,):
            required_skill = "恭维"

        clues.append({
            "id": clue_id,
            "title": f"秘密线索{num:02d}",
            "content": content,
            "visibility": "private",
            "isKey": False,
            "pointsTo": [],
            **({"requiredSkill": required_skill} if required_skill else {}),
        })

    return clues


# ── build the full script ────────────────────────────────────────────────────

def build_script() -> dict:
    """Build the complete script.json from OCR data."""
    script = {}

    # Meta
    script["meta"] = {
        "id": "danshui",
        "title": "丹水山庄",
        "theme": "民国晋城·山庄命案",
        "playerCount": {"min": 7, "max": 7},
        "difficulty": "hard",
        "durationMin": 240,
        "synopsis": "民国三年，山西晋城角山上矗立着一座富丽堂皇的丹水山庄。山庄主人赵万雷在午饭后被人毒杀于卧室，胸口还被人插了一把金龙刀。七位在场之人各怀心事——管家冯双骥、少爷赵卫、小姐赵洛意、丫鬟赵秋儿、护院齐岳、矿商郭望山、神秘来客尹少鸣。谁是凶手？谁在说谎？",
        "styleGuide": "1914 Shanxi, realistic oil painting, warm sepia tones, traditional Chinese mountain mansion, Republican era",
        "schemaVersion": "1.0.0",
        "status": "draft",
    }

    # Characters
    script["characters"] = []
    for char_def in CHAR_DEFS:
        char_id = char_def["id"]
        if char_id == "wanlei":
            # Victim - minimal data
            script["characters"].append({
                "id": char_id,
                "name": char_def["name"],
                "gender": char_def["gender"],
                "age": char_def["age"],
                "isVictim": True,
                "isMurderer": False,
                "publicProfile": "丹水山庄的主人，泽州府本地富商，为人精明但品行不端。",
                "privateScript": "(死者，不参与游戏)",
                "objectives": [],
                "secrets": [],
                "timeline": [
                    {"time": "12:10", "location": "卧室", "action": "午饭后回卧室休息，吃糕饼", "isPublic": True},
                    {"time": "13:20", "location": "卧室", "action": "冯双骥来访，赵万雷拒绝转让兵工厂股权，随后被毒杀", "isPublic": False},
                ],
                "relationships": [
                    {"targetCharId": "feng", "relation": "管家，在赵家工作近二十年", "isPublic": True},
                    {"targetCharId": "luoyi", "relation": "女儿", "isPublic": True},
                    {"targetCharId": "wei", "relation": "儿子（养子）", "isPublic": True},
                ],
                "visual": {
                    "kind": "avatar",
                    "prompt": char_def["visual_prompt"],
                    "aspect": "3:4",
                },
            })
            continue

        parsed = parse_character_files(char_id)

        script["characters"].append({
            "id": char_id,
            "name": char_def["name"],
            "gender": char_def["gender"],
            "age": char_def["age"],
            "isVictim": False,
            "isMurderer": char_def["isVictim"] == False and char_def["isMurderer"],
            "publicProfile": _extract_public_profile(parsed["private_script"]),
            "privateScript": parsed["private_script"],
            "storyByPhase": parsed["story_by_phase"],
            "objectives": parsed["objectives"],
            "secrets": parsed["secrets"],
            "timeline": parsed["timeline"],
            "relationships": parsed["relationships"],
            "skills": parsed["skills"],
            "investigationReport": parsed["investigation_report"],
            "visual": {
                "kind": "avatar",
                "prompt": char_def["visual_prompt"],
                "aspect": "3:4",
            },
        })

    # Scenes
    script["scenes"] = []
    for scene in SCENE_DEFS:
        script["scenes"].append({
            "id": scene["id"],
            "name": scene["name"],
            "description": scene["description"],
            "visual": {
                "kind": "scene",
                "prompt": f"Republican era 1914 Shanxi mountain mansion {scene['name']}, oil painting style, warm lighting",
                "aspect": "16:9",
            },
        })

    # Clues
    normal_clues = parse_clues()
    secret_clues = parse_secret_clues()

    # Post-process: fix key clues with empty pointsTo
    for clue in normal_clues:
        if clue["isKey"] and not clue["pointsTo"]:
            content = clue["content"].lower()
            if "刀" in content or "刃" in content:
                clue["pointsTo"] = ["murder_weapon"]
            elif "椅子" in content or "碎片" in content or "挣扎" in content:
                clue["pointsTo"] = ["crime_scene"]
            elif "药" in content or "瓶子" in content:
                clue["pointsTo"] = ["poison_method"]
            else:
                clue["pointsTo"] = ["crime_scene"]

    script["clues"] = normal_clues + secret_clues

    # Phases - adapted from the game rules
    script["phases"] = _build_phases(script["clues"])

    # Flow
    script["flow"] = _build_flow(script["phases"])

    # Truth
    script["truth"] = _build_truth()

    return script


def _extract_public_profile(private_script: str) -> str:
    """Extract the first paragraph of 人物故事 as publicProfile."""
    # Find the 人物故事 section
    m = re.search(r'##\s*人物故事\s*\n\n(.+?)(?:\n\n|\n##)', private_script, re.DOTALL)
    if m:
        text = m.group(1).strip()
        # Take first 1-2 sentences
        sentences = re.split(r'[。！]', text)
        profile = "。".join(s.strip() for s in sentences[:2] if s.strip())
        if profile:
            return profile + "。"
    return "一个与案件有关的人物。"


def _build_phases(clues: list[dict]) -> list[dict]:
    """Build the game phases."""
    # Separate clues by round
    round1_clues = [c["id"] for c in clues if c.get("visibility") == "searchable" and not c["id"].startswith("sc_")]
    # For now, put all normal searchable clues in round 1, secret clues are private

    # Filter to unique clue IDs
    searchable_ids = list(dict.fromkeys(round1_clues))

    phases = [
        {
            "id": "p_social",
            "kind": "free",
            "title": "午饭后的寒暄",
            "instruction": "玩家们互相认识，通过自我介绍和发问来了解彼此。保持角色性格进行表演。",
            "participants": "all",
            "allowedActions": ["readScript", "speak", "ready"],
            "exit": {"kind": "allReady"},
            "narrativeText": "民国三年立秋后的一天，丹水山庄的客厅里，七位身份各异的人聚在一起吃午饭。饭后，管家冯双骥招呼大家在客厅寒暄。",
        },
        {
            "id": "p_investigation",
            "kind": "free",
            "title": "谁是真凶？",
            "instruction": "赵万雷被发现死在卧室。每个人都可以调查别人的房间或者寻找证人和线索，推断出案情的真相。",
            "participants": "all",
            "allowedActions": ["readScript", "speak", "searchClue", "revealClue", "privateMessage"],
            "unlocks": {"clueIds": searchable_ids},
            "exit": {"kind": "timer", "timerSec": 3600},
            "maxSearches": 8,
            "narrativeText": "下午四点十分，众人聚集在客厅。赵万雷被发现死在二楼卧室里，胸口插着一把金龙刀。凶手就在这七个人之中。",
        },
        {
            "id": "p_vote",
            "kind": "vote",
            "title": "投票指认",
            "instruction": "请投票指认你认为的凶手。",
            "participants": "all",
            "allowedActions": ["castVote"],
            "exit": {"kind": "voteComplete"},
        },
        {
            "id": "p_end_correct",
            "kind": "reveal",
            "title": "结局·真相大白",
            "instruction": "众人识破了真凶的伪装。正义终将得到伸张。",
            "participants": "all",
            "allowedActions": [],
            "exit": {"kind": "timer", "timerSec": 15},
        },
        {
            "id": "p_end_wrong",
            "kind": "reveal",
            "title": "结局·冤案",
            "instruction": "猜疑落在了错误的人身上。无辜者背负了不属于他的罪名，真凶仍在暗处。",
            "participants": "all",
            "allowedActions": [],
            "exit": {"kind": "timer", "timerSec": 15},
        },
        {
            "id": "p_end_tie",
            "kind": "reveal",
            "title": "结局·悬案",
            "instruction": "票数分散，无人达成共识。案件悬而未决，但每个人的命运已被改变。",
            "participants": "all",
            "allowedActions": [],
            "exit": {"kind": "timer", "timerSec": 15},
        },
    ]

    # Add vote tiebreak
    phases.insert(3, {
        "id": "p_vote_tiebreak",
        "kind": "vote",
        "title": "平票决胜",
        "instruction": "票数相同，请在以下嫌疑人中再次投票。",
        "participants": "all",
        "allowedActions": ["castVote"],
        "exit": {"kind": "voteComplete"},
        "resetVotes": True,
        "restrictVoteTargets": "tied",
    })

    return phases


def _build_flow(phases: list[dict]) -> dict:
    """Build the phase flow DAG."""
    phase_ids = [p["id"] for p in phases]
    edges = [
        {"from": "p_social", "to": "p_investigation"},
        {"from": "p_investigation", "to": "p_vote"},
        {"from": "p_vote", "to": "p_end_correct", "condition": {"kind": "voteResult", "equalsCharId": "feng"}},
        {"from": "p_vote", "to": "p_vote_tiebreak", "condition": {"kind": "voteTie"}},
        {"from": "p_vote", "to": "p_end_tie", "condition": {"kind": "always"}},
        {"from": "p_vote_tiebreak", "to": "p_end_correct", "condition": {"kind": "voteResult", "equalsCharId": "feng"}},
        {"from": "p_vote_tiebreak", "to": "p_end_wrong", "condition": {"kind": "always"}},
    ]
    return {"entry": "p_social", "edges": edges}


def _build_truth() -> dict:
    """Build the truth object."""
    return {
        "murdererCharIds": ["feng"],
        "method": "冯双骥用夹竹桃粉末撒在糕饼上毒杀赵万雷，随后将尸体移到床上并用金龙刀刺入胸口以伪装死因。夹竹桃是山庄花园种植的剧毒植物，冯双骥事先从冯竹处得知其毒性后采来备用。",
        "motive": "黑狼会（日本势力背景）最后通牒要求赵万雷转让汉阳兵工厂股权给日本公司，赵万雷坚决拒绝。冯双骥受黑狼会胁迫，又发现赵万雷死后可以说服继承人转让，遂下手毒杀。",
        "crimeTimeline": [
            {"time": "13:00", "location": "管家房", "action": "冯双骥回房读黑狼会最后通牒电报，从抽屉取出事先准备的夹竹桃粉末放入口袋", "isPublic": False},
            {"time": "13:20", "location": "赵万雷卧室", "action": "冯双骥敲门进入，劝说赵万雷转让股权被拒，趁其服药时将夹竹桃粉末撒在糕饼上", "isPublic": False},
            {"time": "13:40", "location": "走廊", "action": "冯双骥在走廊遇到赵洛意，告知赵万雷已醒，让她去见父亲（最后一面）", "isPublic": False},
            {"time": "14:30", "location": "赵万雷卧室外", "action": "冯双骥发现屋门反锁，敲门无回应，判断毒已发作", "isPublic": False},
            {"time": "14:50", "location": "赵万雷卧室", "action": "用钥匙开门，发现屋内无人，床前有碎片，让齐岳在门口等候", "isPublic": False},
            {"time": "15:00", "location": "楼梯背面", "action": "冯双骥藏在楼梯背面观察，看到郭望山和齐岳先后上楼又下来", "isPublic": False},
            {"time": "15:20", "location": "赵万雷卧室", "action": "冯双骥重新上楼，在厕所发现赵万雷尸体，将其抬到床上，用金龙刀刺入胸口伪装", "isPublic": False},
        ],
        "solutionChain": ["cl_s_victim_room_35", "cl_s_inner_09", "cl_s_victim_room_36"],
        "reveal": "凶手是管家冯双骥。\n\n冯双骥在赵家工作近二十年，表面上忠心耿耿，实际上是黑狼会的内应。黑狼会是日本势力支持的秘密组织，要求赵万雷转让汉阳兵工厂的股权给日本公司。赵万雷坚决拒绝后，黑狼会发出最后通牒。\n\n冯双骥的女儿冯竹曾告诉他夹竹桃有剧毒，他便从花园采来备用。案发当天下午13:20，他以劝说转让股权为名进入赵万雷卧室，在糕饼上撒了夹竹桃粉末。赵万雷毒发后，冯双骥在15:20进入卧室，发现尸体后将其移到床上，并用墙上的金龙刀刺入胸口，企图将死因伪装成他杀。\n\n【关键证据链】：黑狼会密信→冯双骥与黑狼会的关系→夹竹桃粉末→糕饼投毒→尸体被移动和金龙刀刺入→冯双骥的谎言和时间线破绽。",
        "endings": [
            {
                "id": "en_correct",
                "condition": {"kind": "voteResult", "equalsCharId": "feng"},
                "title": "真相大白",
                "narrative": "众人识破了冯双骥的伪装。他被带走时，回头看了一眼山庄，那是他生活了近二十年的地方。赵洛意站在门口，泪流满面——她终于明白了这个「冯叔叔」的真面目。",
            },
            {
                "id": "en_wrong_wei",
                "condition": {"kind": "voteResult", "equalsCharId": "wei"},
                "title": "替罪羔羊·赵卫",
                "narrative": "赵卫被当成凶手带走。他哈哈大笑，以为自己终于用金龙刀报了仇。真凶冯双骥站在人群中，沉默不语。",
            },
            {
                "id": "en_wrong_yin",
                "condition": {"kind": "voteResult", "equalsCharId": "yin"},
                "title": "替罪羔羊·尹少鸣",
                "narrative": "尹少鸣被当成凶手。他百口莫辩，赵洛意也对他产生了怀疑。真凶冯双骥成功脱身。",
            },
            {
                "id": "en_wrong_qi",
                "condition": {"kind": "voteResult", "equalsCharId": "qi"},
                "title": "替罪羔羊·齐岳",
                "narrative": "齐岳被当成凶手。他沉默地接受了这个结果，但他的真实身份和目的也随着调查浮出水面。",
            },
            {
                "id": "en_wrong_guo",
                "condition": {"kind": "voteResult", "equalsCharId": "guo"},
                "title": "替罪羔羊·郭望山",
                "narrative": "郭望山被当成凶手。他的矿产交易背后隐藏的秘密被揭开，但真正的凶手仍然逍遥法外。",
            },
            {
                "id": "en_wrong_luoyi",
                "condition": {"kind": "voteResult", "equalsCharId": "luoyi"},
                "title": "替罪羔羊·赵洛意",
                "narrative": "赵洛意被当成凶手。冯双骥心中五味杂陈——这是他的亲生女儿，但他不能暴露这个秘密。",
            },
            {
                "id": "en_wrong_qiuer",
                "condition": {"kind": "voteResult", "equalsCharId": "qiuer"},
                "title": "替罪羔羊·赵秋儿",
                "narrative": "赵秋儿被当成凶手。这个十六岁的丫鬟无法为自己辩护，赵洛意试图保护她但无济于事。",
            },
            {
                "id": "en_tie",
                "condition": {"kind": "always"},
                "title": "悬案",
                "narrative": "票数分散，无人达成共识。案件以「死因不明」结案。每个人的命运都被今夜改变，但真相永远埋藏在丹水山庄之中。",
            },
        ],
    }


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    script = build_script()

    # Validate basic structure
    assert script["meta"]["id"] == "danshui"
    assert len(script["characters"]) == 8, f"Expected 8 characters, got {len(script['characters'])}"
    assert len(script["scenes"]) == 8, f"Expected 8 scenes, got {len(script['scenes'])}"
    assert len(script["phases"]) >= 4, f"Expected at least 4 phases, got {len(script['phases'])}"

    # Check for victim and murderer
    victims = [c for c in script["characters"] if c["isVictim"]]
    murderers = [c for c in script["characters"] if c["isMurderer"]]
    assert len(victims) == 1, f"Expected 1 victim, got {len(victims)}"
    assert len(murderers) == 1, f"Expected 1 murderer, got {len(murderers)}"

    # Write output
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(script, f, ensure_ascii=False, indent=2)

    print(f"✅ Written to {OUT}")
    print(f"   Characters: {len(script['characters'])}")
    print(f"   Scenes: {len(script['scenes'])}")
    print(f"   Clues: {len(script['clues'])}")
    print(f"   Phases: {len(script['phases'])}")
    print(f"   Flow edges: {len(script['flow']['edges'])}")
    print(f"   Truth endings: {len(script['truth']['endings'])}")

    # Print clue breakdown
    searchable = [c for c in script["clues"] if c["visibility"] == "searchable"]
    private = [c for c in script["clues"] if c["visibility"] == "private"]
    print(f"   Searchable clues: {len(searchable)}")
    print(f"   Private/secret clues: {len(private)}")


if __name__ == "__main__":
    main()
