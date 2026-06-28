#!/usr/bin/env python3
"""Generate JSON for scripts 37-42 (豪门系列)."""
import json, os

BASE = os.path.join(os.path.dirname(__file__), "..", "content")

def save(script_id, filename, data):
    path = os.path.join(BASE, script_id, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  {script_id}/{filename}")

def meta(id, title, theme, playerCount, synopsis, styleGuide):
    return {
        "id": id, "title": title, "theme": theme,
        "playerCount": {"min": playerCount, "max": playerCount},
        "difficulty": "hard", "durationMin": 240, "synopsis": synopsis,
        "styleGuide": styleGuide,
        "cover": {"kind": "cover", "prompt": f"{title} murder mystery, oil painting style", "aspect": "3:4"},
        "schemaVersion": "1.0.0", "status": "draft", "genre": "murder"
    }

def char(id, name, gender, age, isVictim, isMurderer, pub, priv, objs, secrets, timeline, rels):
    return {
        "id": id, "name": name, "gender": gender, "age": age,
        "isVictim": isVictim, "isMurderer": isMurderer,
        "publicProfile": pub, "privateScript": priv,
        "objectives": objs, "secrets": secrets, "timeline": timeline,
        "relationships": rels,
        "visual": {"kind": "avatar", "prompt": f"{name}, {gender}, oil painting style", "aspect": "3:4"}
    }

def obj(cid, n, desc, scoring=5, kind="main"):
    return {"id": f"obj_{cid}_{n}", "kind": kind, "description": desc, "scoring": scoring}

def tl(time, loc, act, pub=False):
    return {"time": time, "location": loc, "action": act, "isPublic": pub}

def rel(target, relation, public=False):
    return {"targetCharId": target, "relation": relation, "isPublic": public}

def clue(id, title, content, vis="searchable", isKey=False, pointsTo=None):
    return {"id": id, "title": title, "content": content, "visibility": vis, "isKey": isKey, "pointsTo": pointsTo or []}

def scene(id, name, desc, prompt):
    return {"id": id, "name": name, "description": desc, "visual": {"kind": "scene", "prompt": prompt, "aspect": "16:9"}}

PHASES_TEMPLATE = [
    {"id": "p_briefing", "kind": "briefing", "title": "阅读剧本", "instruction": "阅读各自的角色剧本。", "participants": "all", "allowedActions": ["readScript", "ready"], "exit": {"kind": "allReady"}},
    {"id": "p_social", "kind": "free", "title": "寒暄阶段", "instruction": "众人相互了解。", "participants": "all", "allowedActions": ["speak", "searchClue", "revealClue", "privateMessage"], "exit": {"kind": "hostAdvance"}, "unlocks": {"clueIds": []}},
    {"id": "p_investigation", "kind": "free", "title": "调查阶段", "instruction": "搜查相关区域。调查2轮后进入下一阶段。", "participants": "all", "allowedActions": ["speak", "searchClue", "revealClue", "privateMessage"], "maxRounds": 2, "exit": {"kind": "hostAdvance"}, "unlocks": {"clueIds": []}},
    {"id": "p_vote", "kind": "vote", "title": "谁是真凶？", "instruction": "投票指认凶手。", "participants": "all", "allowedActions": ["castVote"], "exit": {"kind": "voteComplete"}},
    {"id": "p_reveal", "kind": "reveal", "title": "真相揭晓", "instruction": "公布结果和真相。", "participants": "all", "allowedActions": ["submitTheory"], "exit": {"kind": "hostAdvance"}}
]

FLOW = {
    "entry": "p_briefing",
    "edges": [
        {"from": "p_briefing", "to": "p_social"},
        {"from": "p_social", "to": "p_investigation"},
        {"from": "p_investigation", "to": "p_vote"},
        {"from": "p_vote", "to": "p_reveal"}
    ]
}

def default_phases(clue_ids_social, clue_ids_invest):
    import copy
    phases = copy.deepcopy(PHASES_TEMPLATE)
    phases[1]["unlocks"]["clueIds"] = clue_ids_social
    phases[2]["unlocks"]["clueIds"] = clue_ids_invest
    return phases

# ============================================================
# SCRIPT 37: 蠹虫 (duchong)
# ============================================================
def gen_duchong():
    print("=== 37 蠹虫 ===")
    SID = "duchong"
    save(SID, "meta.json", meta(SID, "蠹虫", "民国煤矿·葬礼连环命案", 9,
        "1914年8月24日，河南雷峡镇丘家为大嫂举办葬礼。煤矿往事、婚外情仇、连环杀人——在鞭炮声中，真相与谎言交织。",
        "Republican era Chinese coal mine town, oil painting style, dramatic lighting"))

    chars = [
        char("fangwei", "芳薇", "female", 26, False, True,
             "丘家小姐，樊动征之妹，马尚远之妻。行事规矩，一板一眼。",
             "你发现丈夫尚远与侄媳伊水有染，在葬礼当天用注射器迷晕丈夫后刺死，又用猎枪射杀伊水。",
             [obj("fw",1,"隐瞒你杀了尚远和伊水。(2x10分)",20), obj("fw",2,"触发全部回忆。(2分)",2)],
             ["用注射器迷晕并刺死丈夫尚远", "用猎枪射杀伊水", "会使用猎枪"],
             [tl("1910年4月","丘宅","丘家正式接管煤矿，尚远被派去当总管助手"),
              tl("1914年8月20日晚","洋馆","发现丈夫与伊水在杂物房私会"),
              tl("1914年8月24日7:00","丘宅饭堂","用注射器迷晕尚远后刺死"),
              tl("1914年8月24日8:00","洋馆杂物房","在鞭炮声中用猎枪射杀伊水")],
             [rel("shangyuan","夫妻",True), rel("yishui","仇人(发现婚外情)"), rel("fandongzheng","兄妹",True)]),

        char("shangyuan", "马尚远", "male", 26, True, False,
             "樊动征手下，体格结实，工作从不饮酒。马家兄弟中的哥哥。",
             "你为樊动征管理煤矿，与弟媳伊水产生感情，被安排娶芳薇为妻。在葬礼当天被芳薇杀害。",
             [obj("sy",1,"找到3号矿道塌方的真相。(5分)",5)],
             ["与伊水有婚外情", "帮樊动征隐瞒煤矿事故真相"],
             [tl("1910年4月","煤矿","被派去当大蔡的助手"),
              tl("1910年5月17日","亦亭","樊动征安排调查煤矿倒卖之事"),
              tl("1914年8月24日","丘宅","被芳薇杀害")],
             [rel("fangwei","夫妻",True), rel("shangli","兄弟",True), rel("fandongzheng","主仆",True), rel("yishui","情人")]),

        char("shangli", "马尚力", "male", 23, False, True,
             "尚远之弟，体格结实。暗恋伊水已久。",
             "你在樊动征指使下引爆炸药造成矿道塌方，后因暗恋伊水，毒杀虐待她的丘芊娇。",
             [obj("sl",1,"隐瞒你毒杀丘芊娇。(10分)",10), obj("sl",2,"找出大哥尚远死亡真相。(5分)",5)],
             ["在樊动征指使下引爆矿道炸药", "用鼠毒药毒杀丘芊娇", "与伊水有私情"],
             [tl("1910年5月17日","旧矿道入口","在樊动征指使下引爆炸药"),
              tl("1914年8月20日","洋馆厨房","在芊娇药包中下毒"),
              tl("1914年8月24日7:30","丘宅","被蒙面人(芳薇)迷晕")],
             [rel("shangyuan","兄弟",True), rel("yishui","暗恋"), rel("yijia","暗恋(误认)"), rel("fandongzheng","上下级")]),

        char("qingdu", "青笃", "male", 24, False, False,
             "樊动征与芊娇之子，伊水之夫。性格刚烈。",
             "你是丘家二少爷，母亲芊娇突然病死令你悲痛万分，妻子伊水也遭人杀害。",
             [obj("qd",1,"找出母亲芊娇死亡真相。(5分)",5), obj("qd",2,"找出每个命案的真相。(5分)",5)],
             ["在婚礼上与知常打架", "怀疑妻子伊水有外遇"],
             [tl("1910年","丘宅","与方家姐妹相识"),
              tl("1913年6月16日","洋馆次卧","与伊水成婚"),
              tl("1914年8月24日","洋馆","参加母亲葬礼，发现妻子被杀")],
             [rel("yishui","夫妻",True), rel("zhichang","堂兄弟",True), rel("fandongzheng","父子",True)]),

        char("zhichang", "知常", "male", 25, False, False,
             "丘家大少爷，性格沉稳。",
             "你是丘家长孙，一直在丘宅生活，对家族煤矿事务有所了解。",
             [obj("zc",1,"找到3号矿道塌方真相。(5分)",5), obj("zc",2,"找出每个命案真相。(5分)",5)],
             ["知道煤矿的一些内幕"],
             [tl("1910年5月","煤矿宿舍","去找大蔡密谈"),
              tl("1910年5月17日","煤矿入口","目睹塌方事故"),
              tl("1914年8月24日","洋馆","参加葬礼")],
             [rel("qingdu","堂兄弟",True), rel("fandongzheng","叔侄",True)]),

        char("xiaoyin", "小茵", "female", 22, False, False,
             "丘家丫鬟，后被樊动征纳为小妾。",
             "你原是丘家丫鬟，照顾二少爷，后被樊动征纳为小妾。你知道很多丘家的秘密。",
             [obj("xy",1,"找出每个命案真相。(5分)",5)],
             ["知道樊动征的许多秘密", "曾目睹一些关键事件"],
             [tl("1910年","丘宅","作为丫鬟在丘家生活"),
              tl("1911年","洋馆","被樊动征纳为小妾"),
              tl("1914年8月24日","丘宅/洋馆","参加葬礼")],
             [rel("fandongzheng","妾室"), rel("zhichang","主仆"), rel("qingdu","主仆")]),

        char("yishui", "伊水", "female", 20, True, False,
             "方仁亭之女，青笃之妻。温柔美丽。",
             "你是方仁亭的长女，父亲在矿难中去世后被丘家收留，嫁给青笃。你与尚力有私情，被芳薇发现后遭杀害。",
             [obj("ys",1,"找出矿难真相。(5分)",5)],
             ["与尚力有私情", "父亲死于矿难"],
             [tl("1910年5月17日","煤矿入口","父亲方仁亭死于矿难"),
              tl("1913年6月16日","洋馆次卧","嫁给青笃"),
              tl("1914年8月24日","洋馆杂物房","被芳薇用猎枪射杀")],
             [rel("qingdu","夫妻",True), rel("shangli","情人"), rel("yijia","姐妹",True)]),

        char("yijia", "伊佳", "female", 16, False, False,
             "方仁亭幼女，伊水之妹。天真活泼。",
             "你是方仁亭的小女儿，父亲在矿难中去世后与姐姐相依为命。",
             [obj("yj",1,"找出每个命案真相。(5分)",5)],
             ["知道姐姐的一些秘密"],
             [tl("1910年5月17日","煤矿入口","父亲死于矿难"),
              tl("1913年6月16日","洋馆","姐姐嫁给青笃"),
              tl("1914年8月24日","洋馆","参加葬礼")],
             [rel("yishui","姐妹",True), rel("fangwei","长辈")]),

        char("fandongzheng", "樊动征", "male", 50, True, False,
             "丘家家主，芊娇之夫。精明能干。",
             "你为丘家赎买煤矿立下大功，却在妻子葬礼当天神秘失踪，后被发现死于洋馆。",
             [],
             ["指使尚力引爆矿道", "隐瞒妻子芊娇的真实死因"],
             [tl("1910年","雷峡镇","谈判赎买煤矿"),
              tl("1914年8月21日","洋馆","断定芊娇病死"),
              tl("1914年8月24日","洋馆","在葬礼中失踪，后被发现死亡")],
             [])
    ]
    for c in chars:
        save(SID, f"characters/{c['id']}.json", c)

    clues = [
        clue("cl_mine_collapse", "煤矿塌方", "1910年5月17日，3号矿道发生爆炸塌方，蔡总管和方经理遇难。", "searchable", True, ["truth_mine"]),
        clue("cl_syringe", "注射器", "在丘宅饭堂附近发现一支注射器，上面有麻醉剂残留。", "searchable", True, ["truth_shangyuan"]),
        clue("cl_kitchen_knife", "染血厨刀", "丘宅饭堂发现一把染血的厨刀，是杀死尚远的凶器。", "searchable", True, ["truth_shangyuan"]),
        clue("cl_rifle", "猎枪", "洋馆陈列柜中的猎枪，曾被用于射杀伊水。", "searchable", True, ["truth_yishui"]),
        clue("cl_painting", "被移动的水墨画", "丘宅走廊上一副水墨画被移动过，下面墙上刻着字。", "searchable", False, ["truth_shangli"]),
        clue("cl_will", "遗嘱", "芊娇生前留下的遗嘱，只与两位少爷有关，没有樊动征的名字。", "searchable", False, []),
        clue("cl_medicine", "药包", "芊娇每天服用的药包被发现有异常，疑似被下毒。", "searchable", True, ["truth_qianjiao"]),
        clue("cl_letter", "纸条", "从伊水处发现的纸条，写着要去亦亭约会的内容。", "searchable", False, ["truth_affair"])
    ]
    save(SID, "clues.json", clues)

    scenes = [
        scene("s_yangguan", "洋馆", "丘家洋馆，原为英吉利人住所，现为丘家产业，葬礼举行地。", "Republican era Chinese mansion interior, oil painting style"),
        scene("s_qiuzhai", "丘宅", "丘家老宅，住客的房间所在。", "Republican era Chinese courtyard house, oil painting style"),
        scene("s_mine", "煤矿入口", "雷峡镇煤矿入口，1910年曾发生塌方事故。", "Chinese coal mine entrance, oil painting style"),
        scene("s_yiting", "亦亭", "镇中的凉亭，樊动征与手下密谈之处。", "Chinese pavilion in a town, oil painting style")
    ]
    save(SID, "scenes.json", scenes)

    social_ids = ["cl_mine_collapse", "cl_will"]
    invest_ids = ["cl_syringe", "cl_kitchen_knife", "cl_rifle", "cl_painting", "cl_medicine", "cl_letter"]
    save(SID, "phases.json", default_phases(social_ids, invest_ids))
    save(SID, "flow.json", FLOW)

    save(SID, "truth.json", {
        "murdererCharIds": ["fangwei", "shangli"],
        "method": "芳薇用注射器迷晕尚远后用厨刀刺杀，又在鞭炮声中用猎枪射杀伊水；尚力用鼠毒药毒杀丘芊娇。",
        "motive": "芳薇发现丈夫尚远与伊水的婚外情，尚力为保护暗恋的伊水毒杀虐待她的丘芊娇。",
        "crimeTimeline": [
            tl("1910年5月17日","3号矿道","尚力在樊动征指使下引爆炸药造成塌方",True),
            tl("1914年8月20日晚","洋馆厨房","尚力在芊娇药包中下毒"),
            tl("1914年8月21日","洋馆主卧","芊娇毒发身亡，樊动征断定病死",True),
            tl("1914年8月24日7:00","丘宅饭堂","芳薇用注射器迷晕尚远后刺死"),
            tl("1914年8月24日8:00","洋馆杂物房","芳薇在鞭炮声中用猎枪射杀伊水"),
            tl("1914年8月24日10:00","丘宅","尚力发现尚远尸体",True)
        ],
        "solutionChain": ["cl_syringe", "cl_rifle", "cl_medicine"],
        "reveal": "芳薇因发现丈夫尚远与伊水的婚外情，在葬礼当天趁鞭炮声掩护先后杀死二人。尚力则因暗恋伊水，早在8月20日毒杀了虐待伊水的丘芊娇。1910年的矿难也是尚力在樊动征指使下造成的。",
        "endings": [
            {"id": "end_good", "condition": {"kind": "always"}, "title": "真相揭晓", "narrative": "凶手被找出，丘家的秘密被揭开。"},
            {"id": "end_bad", "condition": {"kind": "always"}, "title": "真相掩埋", "narrative": "真相被掩埋，蠹虫继续蛀蚀丘家。"}
        ]
    })


# ============================================================
# SCRIPT 38: 烛影额妆 (zhuyingezhuang)
# ============================================================
def gen_zhuyingezhuang():
    print("=== 38 烛影额妆 ===")
    SID = "zhuyingezhuang"
    save(SID, "meta.json", meta(SID, "烛影额妆", "清末福州·涨秋园连环命案", 7,
        "1906年（光绪三十二年）农历六月十七，福州衣锦坊「涨秋园」内发生连环命案。千工拔步床前，恩怨纠葛、身份替换、复仇与灭口——真相在烛影摇红中浮现。",
        "Late Qing dynasty Fuzhou traditional garden mansion, oil painting style"))

    chars = [
        char("ruomiao", "若缈(房远)", "male", 31, False, True,
             "身穿白洋裙少年装扮的访客，实为房家后人。表面文弱，实为连环杀手。",
             "你本名房远，是涨秋园旧主之子。当年林宗斐和重实害你家破人亡，你潜入涨秋园杀死林宗斐，又勒死目击者张联升，毒杀武重实，掐死表姐卓氏。你冒充联升身份脱身。",
             [obj("rm",1,"隐瞒你杀了林宗斐、张联升、武重实、卓氏。(4x10分)",40), obj("rm",2,"找到并抓捕仟捌。(5分)",5)],
             ["本名房远，冒充联升身份", "杀死林宗斐为父报仇", "勒死张联升灭口", "是朝廷密探/稽查"],
             [tl("1906年农历六月十七凌晨","涨秋园书房","用短刀刺杀林宗斐"),
              tl("1906年农历六月十七凌晨","涨秋园客房","勒死张联升并纵火"),
              tl("1914年10月22日","涨秋园观池厅","毒杀武重实"),
              tl("1914年10月22日","涨秋园","掐死卓氏")],
             [rel("zhangliansheng","冒充对象"), rel("linzongfei","仇人"), rel("jinshan","表姐")]),

        char("zishu", "紫袖", "female", 17, False, False,
             "毡帽少年打扮，实为烟柳阁的女扮男装少女。暗恋利哥。",
             "你女扮男装在烟柳阁长大，暗恋庄公子(利志)。利志死后你由常编辑照顾，加入反袁组织，为给利志报仇出卖仟捌。",
             [obj("zs",1,"找出利志死亡真相。(5分)",5), obj("zs",2,"陷害仟捌被捕。(5分)",5)],
             ["女扮男装", "暗恋利志", "是反袁组织成员", "出卖仟捌行踪"],
             [tl("1906年农历六月十六","涨秋园","溜进北院欲杀皑雪未遂"),
              tl("1906年农历六月十七","涨秋园厨房","发现尸体"),
              tl("1914年10月22日","涨秋园","回到故园，执行仟捌接头计划")],
             [rel("lizhi","暗恋"), rel("lianchou","情敌"), rel("lianliansheng","相识")]),

        char("lianchou", "利愁", "female", 16, False, False,
             "庄亨本与金棠之女，利志的妹妹。温柔善良。",
             "你是庄家小姐，兄长利志在婚前遭遇不测，母亲卓氏也惨遭杀害。你必须找出真相。",
             [obj("lc",1,"找出母亲卓氏死亡真相。(5分)",5), obj("lc",2,"找出每个命案真相。(5分)",5)],
             ["知道母亲与联升(实为房远)的冲突"],
             [tl("1906年农历六月十七","涨秋园厨房","发现尸体"),
              tl("1914年10月22日","涨秋园","发现母亲尸体")],
             [rel("lizhi","兄妹",True), rel("zhuanghengben","父女",True), rel("aixue","姑嫂",True)]),

        char("lianliansheng", "张联升(房远)", "male", 41, False, True,
             "身穿西装的访客，自称卓家少爷的贴身书童。真实身份是房远冒充。",
             "你实际上是房远，冒充了真正的张联升的身份。你杀死武重实和卓氏后继续以联升身份活动。",
             [obj("ll",1,"隐瞒你冒充联升以及你是稽查。(2x2分)",4), obj("ll",2,"找到仟捌。(5分)",5)],
             ["真实身份是房远/若缈", "杀死武重实和卓氏", "是朝廷稽查"],
             [tl("1906年农历六月十七","涨秋园","跟随林宗斐来到涨秋园"),
              tl("1914年10月22日","涨秋园观池厅","毒杀武重实"),
              tl("1914年10月22日","涨秋园","掐死卓氏")],
             [rel("ruomiao","同一人(真实身份)"), rel("aixue","假装相识")]),

        char("chengxian", "成贤", "male", 22, False, False,
             "利志的学弟，曾是利志的好友。知道利志的一些秘密。",
             "你是利志的学弟，知道他参加集会反对洋人之事。你见证了涨秋园的多次命案。",
             [obj("cx",1,"找出每个命案真相。(5分)",5)],
             ["知道利志参加反洋集会", "知道利志的秘密感情"],
             [tl("1906年农历六月十五","烟柳阁","与利志、若缈饮酒"),
              tl("1906年农历六月十七","涨秋园","发现尸体"),
              tl("1914年10月22日","涨秋园","再次卷入命案")],
             [rel("lizhi","学长/好友",True), rel("zishu","相识")]),

        char("aixue", "皑雪", "female", 20, False, False,
             "林宗斐之女，利志的准新娘。身怀六甲。",
             "你是林宗斐的女儿，本要嫁给利志，却在婚礼前遭遇父亲被杀、未婚夫死于大火。多年后带着遗腹子回到涨秋园。",
             [obj("ax",1,"找出父亲林宗斐死亡真相。(5分)",5), obj("ax",2,"找出每个命案真相。(5分)",5)],
             ["怀着利志的遗腹子", "曾被人(紫袖)试图勒杀未遂"],
             [tl("1906年农历六月十六","涨秋园北屋","差点被紫袖勒杀"),
              tl("1906年农历六月十七","涨秋园","发现父亲和未婚夫死亡"),
              tl("1914年10月22日","涨秋园","带着孩子回到故园")],
             [rel("lizhi","未婚夫妻"), rel("lianchou","姑嫂"), rel("linzongfei","父女",True)]),

        char("zhuanghengben", "庄亨本", "male", 50, False, False,
             "涨秋园主人，利志和利愁之父。丧子后沉溺酒色。",
             "你是涨秋园的家主，儿子利志死后你沉溺酒色，败了家业。如今连妻子卓氏也惨遭杀害。",
             [obj("zh",1,"找出每个命案真相。(5分)",5)],
             ["知道仟捌的一些线索"],
             [tl("1906年农历六月十七","涨秋园","处理利志之死"),
              tl("1914年10月22日","涨秋园后院","发现妻子尸体")],
             [rel("lizhi","父子",True), rel("lianchou","父女",True), rel("aixue","翁媳")])
    ]
    for c in chars:
        save(SID, f"characters/{c['id']}.json", c)

    clues = [
        clue("cl_kitchen_bodies", "厨房女尸", "涨秋园厨房内发现两具女尸，一为丫鬟碧彩，一为蓝衣少女。", "searchable", True, ["truth_kitchen"]),
        clue("cl_study_body", "书房尸体", "涨秋园书房内发现林宗斐的尸体，胸口被短刀刺入。", "searchable", True, ["truth_lin"]),
        clue("cl_fire_ruins", "客房废墟", "涨秋园客房被烧毁，废墟下发现两具男尸，为利志和若缈(张联升)。", "searchable", True, ["truth_fire"]),
        clue("cl_jade_token", "玉腰牌", "刻有「书僮联升」的玉腰牌，是证明身份的物件。", "searchable", True, ["truth_identity"]),
        clue("cl_newspaper_ad", "报纸广告", "报纸上刊登的广告《锦坊庄院，出售千工八步床》，内含暗号。", "searchable", False, ["truth_qianba"]),
        clue("cl_poison_bottle", "密封瓶", "一个空的密封瓶，曾装有毒药。", "searchable", True, ["truth_wuzhongshi"]),
        clue("cl_hanging_body", "吊死女人", "涨秋园梅花林中发现一个被吊起的毁容女人。", "searchable", True, ["truth_hanging"])
    ]
    save(SID, "clues.json", clues)

    scenes = [
        scene("s_zhangqiu", "涨秋园", "福州衣锦坊内的园林宅邸，多次命案发生地。", "Late Qing dynasty Fuzhou traditional garden mansion, oil painting style"),
        scene("s_kitchen", "厨房", "涨秋园厨房，发现两具女尸。", "Chinese traditional kitchen, oil painting style"),
        scene("s_study", "书房", "涨秋园书房，林宗斐被杀之处。", "Chinese traditional study room, oil painting style"),
        scene("s_north_house", "北屋/拔步床", "涨秋园北院北屋，内有千工拔步床。", "Chinese traditional bedroom with elaborate bed, oil painting style")
    ]
    save(SID, "scenes.json", scenes)

    save(SID, "phases.json", default_phases(
        ["cl_kitchen_bodies"],
        ["cl_study_body", "cl_fire_ruins", "cl_jade_token", "cl_newspaper_ad", "cl_poison_bottle", "cl_hanging_body"]
    ))
    save(SID, "flow.json", FLOW)

    save(SID, "truth.json", {
        "murdererCharIds": ["ruomiao", "lianliansheng"],
        "method": "房远(若缈)用短刀刺杀林宗斐，勒死张联升并纵火；冒充联升身份后毒杀武重实，掐死卓氏。紫袖曾试图勒杀皑雪未遂。",
        "motive": "房远为报家仇——林宗斐和重实(武重实)当年勾结陷害房家，导致家破人亡。灭口联升是因为他目睹房远从书房出来。",
        "crimeTimeline": [
            tl("1906年农历六月十七凌晨","涨秋园书房","房远用短刀刺杀林宗斐"),
            tl("1906年农历六月十七凌晨","涨秋园客房","房远勒死张联升并纵火"),
            tl("1914年10月22日","涨秋园观池厅","房远(冒充联升)毒杀武重实"),
            tl("1914年10月22日","涨秋园","房远掐死卓氏")
        ],
        "solutionChain": ["cl_jade_token", "cl_study_body", "cl_poison_bottle"],
        "reveal": "房远(若缈)是涨秋园旧主之子，因林宗斐和武重实陷害导致家破人亡。他先杀死林宗斐报仇，又灭口目击者联升，冒充其身份脱身。多年后他以稽查身份追踪仟捌，回到涨秋园再次杀人。",
        "endings": [
            {"id": "end_good", "condition": {"kind": "always"}, "title": "真相揭晓", "narrative": "房远的连环杀人被揭露，涨秋园的恩怨终于真相大白。"},
            {"id": "end_bad", "condition": {"kind": "always"}, "title": "真相掩埋", "narrative": "真相被掩埋，涨秋园的冤魂依旧不得安息。"}
        ]
    })


# ============================================================
# SCRIPT 39: 离地三寸 (lidisancun)
# ============================================================
def gen_lidisancun():
    print("=== 39 离地三寸 ===")
    SID = "lidisancun"
    save(SID, "meta.json", meta(SID, "离地三寸", "民国湘西·僵尸传说连环命案", 7,
        "1914年11月，湘南零陵「陵下村」义庄内出现不腐之尸。僵尸复活、离奇命案、家族秘术——真相在月光下浮现。",
        "Republican era rural Hunan village with Chinese zombie folklore, oil painting style"))

    chars = [
        char("chenzhi", "晨枝", "female", 16, False, True,
             "野茅之女，小圆脸，梳着长辫子。住在宝瑟庄小姐房。",
             "你为报母亲之仇，用寿衣闷死了大伯野芦。你一直认定是大伯见死不救导致母亲死亡。",
             [obj("cz",1,"隐瞒你杀了野芦。(10分)",10), obj("cz",2,"触发全部回忆。(2分)",2)],
             ["用寿衣闷死大伯野芦", "认定大伯害死母亲"],
             [tl("1903年农历三月十五","义庄","母亲被僵尸吸干精气后死亡"),
              tl("1904年","宝瑟庄","随父亲搬入宝瑟庄"),
              tl("1914年11月2日","宝瑟庄东屋","用寿衣闷死野芦")],
             [rel("zhaoyang","堂兄",True), rel("zhaoyue","堂兄",True), rel("lingshu","好友",True), rel("libo","父亲",True), rel("yelu","大伯")]),

        char("zhaoyang", "照阳", "male", 22, False, False,
             "野芦长子，因幼年目睹僵尸而智力受损。力大憨厚。",
             "你6岁时目睹僵尸从棺材中出来，此后脑子就不太好使。你喜欢施升的妹妹施香。",
             [obj("zy",1,"找出旺远死亡真相。(5分)",5), obj("zy",2,"找出母亲死亡真相。(5分)",5)],
             ["幼年目睹僵尸受惊", "喜欢施香"],
             [tl("1900年农历十月十六","义庄","目睹僵尸从棺材中出来"),
              tl("1911年农历三月","义庄","照顾施香并喜欢上她"),
              tl("1914年11月2日","宝瑟庄","发现父亲野芦受伤")],
             [rel("zhaoyue","兄弟",True), rel("chenzhi","堂妹",True), rel("shixiang","暗恋")]),

        char("zhaoyue", "照月", "male", 20, False, False,
             "野芦次子，比哥哥机灵。暗恋灵姝。",
             "你是照阳的弟弟，喜欢灵姝。你帮助大哥调查义庄中的各种怪事。",
             [obj("zy2",1,"找出每个命案真相。(5分)",5), obj("zy2",2,"触发全部回忆。(2分)",2)],
             ["暗恋灵姝", "知道盗矿之事"],
             [tl("1911年农历三月","义庄","目睹僵尸复活"),
              tl("1914年农历三月廿三","石桥","发现施香的尸体"),
              tl("1914年11月2日","义庄","被晨枝叫去宝瑟庄")],
             [rel("zhaoyang","兄弟",True), rel("chenzhi","堂妹",True), rel("lingshu","暗恋")]),

        char("qiaoli", "覃巧丽", "female", 30, False, False,
             "野茅续弦之妻，宝瑟庄女主人。",
             "你是野茅的续弦妻子，嫁给野茅后住在宝瑟庄。你知道很多庄内的秘密。",
             [obj("ql",1,"找出每个命案真相。(5分)",5)],
             ["知道宝瑟庄的一些秘密"],
             [tl("1904年","宝瑟庄","嫁给野茅"),
              tl("1911年农历三月","宝瑟庄","帮助施升兄妹"),
              tl("1914年11月2日","宝瑟庄","发现野芦受伤")],
             [rel("libo","夫妻",True), rel("chenzhi","继女",True)]),

        char("libo", "离病", "male", 22, False, False,
             "落生之子，住在宝瑟庄西屋。从小和晨枝如同兄妹。",
             "你是落生的儿子，父亲外出后失踪多年，后来尸体被送回义庄。你住在宝瑟庄管理事务。",
             [obj("lb",1,"找出父亲落生死亡真相。(5分)",5), obj("lb",2,"找出每个命案真相。(5分)",5)],
             ["知道僵尸的一些传说"],
             [tl("1903年","义庄厨房","目睹僵尸黑影"),
              tl("1911年农历三月","宝瑟庄","管理庄内事务"),
              tl("1914年11月2日","宝瑟庄","目睹僵尸复活")],
             [rel("chenzhi","如同兄妹",True), rel("lingshu","相识")]),

        char("lingshu", "灵姝", "female", 18, False, False,
             "田家姑娘，田运劳之女。常来讲僵尸故事。",
             "你是田运劳的女儿，从小和施升青梅竹马。你相信僵尸存在，知道很多灵异传说。",
             [obj("ls",1,"找出每个命案真相。(5分)",5)],
             ["知道僵尸传说", "与施升青梅竹马"],
             [tl("1911年农历三月","陵下村","带施升来村里"),
              tl("1914年农历三月廿三","石桥","发现施香尸体"),
              tl("1914年11月2日","宝瑟庄","目睹僵尸复活")],
             [rel("chenzhi","好友",True), rel("zhaoyue","相识")]),

        char("shisheng", "施升", "male", 20, True, False,
             "斯文少年，旺远之子。在义庄验尸后失踪，后发现死于峭壁下。",
             "你是旺远的儿子，带妹妹施香来到陵下村。你在义庄验尸后遭遇不测，后被发现死于峭壁下。",
             [obj("ss",1,"找出旺远死亡真相。(5分)",5)],
             ["懂得验尸之术"],
             [tl("1911年农历三月初十","陵下村","带妹妹施香来到村里"),
              tl("1911年农历三月十四","义庄","在义庄验尸"),
              tl("1911年农历四月十二","村西山峭壁","被发现死亡")],
             [rel("shixiang","兄妹",True), rel("lingshu","青梅竹马")])
    ]
    for c in chars:
        save(SID, f"characters/{c['id']}.json", c)

    clues = [
        clue("cl_wangyuan_body", "旺远尸体", "旺远死在宝瑟庄东屋外，面容扭曲，死因不明。", "searchable", True, ["truth_wangyuan"]),
        clue("cl_zombie_sighting", "僵尸目击", "多人在义庄目睹僵尸从棺材中复活。", "searchable", False, []),
        clue("cl_mother_death", "母亲之死", "麻氏被发现死在义庄附近的树林中，头上有伤。", "searchable", True, ["truth_mother"]),
        clue("cl_shixiang_body", "施香尸体", "在偃勾河石桥下发现穿着红衣裙的女尸，已肿胀腐烂。", "searchable", True, ["truth_shixiang"]),
        clue("cl_shisheng_body", "施升尸体", "在村西山峭壁下发现施升尸体，身穿孝衣，头部有伤。", "searchable", True, ["truth_shisheng"]),
        clue("cl_coffin_broken", "破棺", "施升的坟被刨开，棺材中没有尸骨。", "searchable", True, ["truth_shisheng"])
    ]
    save(SID, "clues.json", clues)

    scenes = [
        scene("s_yizhuang", "义庄", "陵下村义庄，停放尸体之处，有僵尸传说。", "Chinese rural funeral house, eerie atmosphere, oil painting style"),
        scene("s_baosezhuang", "宝瑟庄", "覃巧丽的宅院，分为北中南三院。", "Chinese rural courtyard house, oil painting style"),
        scene("s_village", "陵下村", "湘南零陵东的小山村。", "Southern Chinese mountain village, oil painting style"),
        scene("s_graveyard", "坟山", "村中的墓地，旺远和施升都葬在此处。", "Chinese mountain graveyard, moonlight, oil painting style")
    ]
    save(SID, "scenes.json", scenes)

    save(SID, "phases.json", default_phases(
        ["cl_wangyuan_body"],
        ["cl_zombie_sighting", "cl_mother_death", "cl_shixiang_body", "cl_shisheng_body", "cl_coffin_broken"]
    ))
    save(SID, "flow.json", FLOW)

    save(SID, "truth.json", {
        "murdererCharIds": ["chenzhi"],
        "method": "晨枝用寿衣闷死大伯野芦。其他命案另有原因：旺远被僵尸所害，麻氏被野芦按家法处置，施升坠崖身亡，施香溺水而亡。",
        "motive": "晨枝认定大伯野芦当年见死不救导致母亲麻氏死亡，趁野芦受伤之际用寿衣将其闷死复仇。",
        "crimeTimeline": [
            tl("1903年农历三月十五","义庄附近","麻氏遭遇僵尸后被野芦按家法处置，不治身亡",True),
            tl("1911年农历三月","义庄","旺远在义庄验尸时遭遇僵尸被害"),
            tl("1911年农历三月廿三","偃勾河","施香尸体在河中被发现",True),
            tl("1911年农历四月十二","村西山峭壁","施升尸体被发现",True),
            tl("1914年11月2日","宝瑟庄东屋","晨枝用寿衣闷死野芦")
        ],
        "solutionChain": ["cl_wangyuan_body", "cl_mother_death", "cl_shixiang_body"],
        "reveal": "晨枝为报母亲之仇闷死大伯野芦。当年麻氏遭遇僵尸后，野芦按家法不许救治，导致麻氏死亡。其他命案则与僵尸传说和家族恩怨有关。",
        "endings": [
            {"id": "end_good", "condition": {"kind": "always"}, "title": "真相揭晓", "narrative": "凶手被找出，陵下村的秘密被揭开。"},
            {"id": "end_bad", "condition": {"kind": "always"}, "title": "真相掩埋", "narrative": "真相被掩埋，僵尸传说继续困扰陵下村。"}
        ]
    })


# ============================================================
# SCRIPT 40: 暗波崖 (anboya)
# ============================================================
def gen_anboya():
    print("=== 40 暗波崖 ===")
    SID = "anboya"
    save(SID, "meta.json", meta(SID, "暗波崖", "清末无锡·异法馆连环命案", 6,
        "1914年10月2日，无锡惠山「暗波崖」上的异法馆内，戏法大师应动金展示新绝技「消失术」后神秘消失。随后崔山道死于落石逃生表演的机关中，多条人命交织——真相在戏法与催眠中浮现。",
        "Late Qing dynasty Wuxi magic theater, oil painting style"))

    chars = [
        char("yingjiujin", "应动金", "male", 66, False, False,
             "异法馆主人，戏法大师。韩震白的大徒弟。",
             "你是异法馆的主人，戏法大师。你在看完仙仪的催眠治疗后，决定展示消失术，之后神秘消失。",
             [obj("ydj",1,"找出真相。(5分)",5)],
             ["知道很多家族秘密"],
             [tl("1887年","应宅","女儿娇娇被杀"),
              tl("1914年10月2日","异法馆东二层","展示消失术，进入甲门后消失")],
             [rel("hanergu","夫妻",True), rel("cuishandao","师徒",True), rel("houDongmu","师兄弟",True)]),

        char("xiaoyi_anbo", "仙仪", "female", 26, False, False,
             "侯动木的女徒弟，表演落石逃生绝技。被噩梦困扰。",
             "你是侯动木的徒弟，擅长落石逃生。你长期被噩梦困扰，在孝先的帮助下接受催眠治疗。你不记得自己是否杀过人。",
             [obj("xya",1,"确认自己是否杀过人。(5分)",5), obj("xya",2,"找出崔山道死亡真相。(5分)",5)],
             ["长期被噩梦困扰", "不记得是否杀过人", "被催眠治疗后记忆混乱"],
             [tl("1907年","南京","表演落石逃生"),
              tl("1914年农历五月十九","异法馆次女房","看到胸口有洞的娃娃"),
              tl("1914年10月2日","异法馆","目睹崔山道死亡")],
             [rel("xiaoxian","催眠师/搭档"), rel("cuishandao","师伯的徒弟"), rel("hanergu","师伯娘")]),

        char("xiaoxian", "孝先", "male", 27, False, False,
             "陶山德与娇娇之子，催眠师。在上海演出。",
             "你是陶山德和娇娇的儿子，从小没娘，由外婆韩二姑和师父照顾。你学会了催眠术，帮助仙仪治疗噩梦。你偶然想用仙仪的身体召唤母亲灵魂，但及时停止。",
             [obj("xx",1,"找出母亲娇娇死亡真相。(5分)",5), obj("xx",2,"找出崔山道死亡真相。(5分)",5), obj("xx",3,"帮助仙仪回想起一切。(2分)",2)],
             ["曾想用仙仪身体召唤母亲灵魂", "使用催眠术和药物治疗仙仪"],
             [tl("1901年","应宅","第一次见仙仪"),
              tl("1907年","异法馆客厅","给仙仪催眠治疗"),
              tl("1914年10月2日","异法馆","目睹崔山道死亡")],
             [rel("xiaoyi_anbo","治疗对象/搭档"), rel("hanergu","外婆"), rel("yingjiujin","师伯")]),

        char("pangshanren", "庞山仁", "male", 40, False, False,
             "应动金的三徒弟，表演助手。",
             "你是应动金的三徒弟，参与各种表演。你知道很多关于应家的秘密。",
             [obj("psr",1,"找出每个命案真相。(5分)",5)],
             ["知道应家的许多秘密"],
             [tl("1887年","应宅花园","参与表演，目睹娇娇之死"),
              tl("1907年","南京","参与演出"),
              tl("1914年10月2日","异法馆","目睹应动金消失")],
             [rel("yingjiujin","师徒",True), rel("cuishandao","师兄弟",True)]),

        char("jiabao", "家宝", "male", 25, False, False,
             "应动金与玉笋之子。仗着父母宠爱，无法无天。",
             "你是应动金和玉笋的儿子，从小被溺爱。你对仙仪有非分之想。",
             [obj("jb",1,"找出父亲应动金消失真相。(5分)",5)],
             ["多次骚扰仙仪"],
             [tl("1914年10月2日","异法馆东二层","被父亲训斥后接受手杖"),
              tl("1914年10月2日","异法馆甲门内","搜寻父亲后失踪")],
             [rel("yingjiujin","父子",True), rel("xiaoyi_anbo","纠缠对象")]),

        char("touli", "头励", "male", 8, False, False,
             "侯动木收养的男孩，仙仪的新徒弟。真实身份是老四的孩子。",
             "你是侯动木收养的男孩，被带到异法馆记入门派名录。你的亲生父母是个谜。",
             [],
             ["真实身份是老四的孩子"],
             [tl("1914年10月1日","异法馆","被带去拜师")],
             [rel("xiaoyi_anbo","师父",True)])
    ]
    for c in chars:
        save(SID, f"characters/{c['id']}.json", c)

    clues = [
        clue("cl_cui_body", "崔山道尸体", "崔山道死在落石逃生的木箱中，被砂石掩埋。", "searchable", True, ["truth_cui"]),
        clue("cl_vanish", "消失术", "应动金展示消失术进入甲门后神秘消失，甲门从内锁上。", "searchable", True, ["truth_ying"]),
        clue("cl_doll", "胸口有洞的娃娃", "仙仪在次女房发现的诡异娃娃，令她噩梦不断。", "searchable", False, []),
        clue("cl_dontexist", "不存在之人", "多人声称看到「不存在之人」，引发恐惧。", "searchable", False, []),
        clue("cl_sealed_letter", "火漆信", "应动金准备好的火漆封口信件。", "searchable", False, []),
        clue("cl_poison_anbo", "镇静剂", "孝先使用的镇静剂，用于催眠治疗。", "searchable", True, ["truth_poison"])
    ]
    save(SID, "clues.json", clues)

    scenes = [
        scene("s_yifaguan", "异法馆", "无锡暗波崖上的宅邸，戏法师的家。", "Mountain cliff Chinese mansion, oil painting style"),
        scene("s_east_second", "东二层", "异法馆东二层，内设镇邪法阵和甲门。", "Chinese mansion second floor with mysterious doors, oil painting style"),
        scene("s_garden", "花园", "异法馆花园，落石逃生表演场地。", "Chinese mansion garden with performance area, oil painting style"),
        scene("s_guestroom", "客房", "异法馆客房，仙仪和孝先曾在此治疗。", "Chinese traditional guest room, oil painting style")
    ]
    save(SID, "scenes.json", scenes)

    save(SID, "phases.json", default_phases(
        ["cl_cui_body"],
        ["cl_vanish", "cl_doll", "cl_dontexist", "cl_sealed_letter", "cl_poison_anbo"]
    ))
    save(SID, "flow.json", FLOW)

    save(SID, "truth.json", {
        "murdererCharIds": ["jiabao"],
        "method": "家宝在崔山道表演落石逃生时做了手脚，导致砂石提前落下将崔山道砸死。应动金的消失是通过甲门后的密道离开。",
        "motive": "家宝因被父亲应动金训斥并禁止某些行为而心怀怨恨，在机关上做手脚害死崔山道。应动金的消失另有原因。",
        "crimeTimeline": [
            tl("1887年农历九月十一","应宅花园","娇娇在表演期间被杀(另有真凶)"),
            tl("1914年10月2日上午","异法馆花园","崔山道死于落石逃生机关"),
            tl("1914年10月2日上午","异法馆东二层","应动金展示消失术后消失")
        ],
        "solutionChain": ["cl_cui_body", "cl_vanish", "cl_poison_anbo"],
        "reveal": "崔山道之死是家宝在落石逃生机关上做手脚所致。应动金通过甲门后的密道离开异法馆，他的消失另有隐情。",
        "endings": [
            {"id": "end_good", "condition": {"kind": "always"}, "title": "真相揭晓", "narrative": "戏法背后的真相被揭开。"},
            {"id": "end_bad", "condition": {"kind": "always"}, "title": "真相掩埋", "narrative": "真相被掩埋，异法馆的秘密永远成谜。"}
        ]
    })


# ============================================================
# SCRIPT 41: 歧路梢 (qilushao)
# ============================================================
def gen_qilushao():
    print("=== 41 歧路梢 ===")
    SID = "qilushao"
    save(SID, "meta.json", meta(SID, "歧路梢", "民国武汉·范公馆连环命案", 6,
        "1914年8月28日，汉口「范公馆」内发生连环命案。范裕庆坠楼身亡，冒牌未婚夫被杀，毁容女尸吊在梅花林——真相在金钱与爱情的歧路中浮现。",
        "Republican era Hankou mansion, oil painting style"))

    chars = [
        char("gaoshengxiang", "高襄生", "male", 35, False, True,
             "永信融经理，范裕庆的下属。外甥的舅舅。",
             "你是永信融的经理，外甥之赋即将娶范裕庆的女儿禾珍。你当年杀了汤望之，又找人冒充外甥。你在范公馆向叶小姐求婚。",
             [obj("gsx",1,"隐瞒你杀了汤望之。(10分)",10), obj("gsx",2,"找出毁容女人死亡真相。(5分)",5)],
             ["杀害汤望之并掩埋", "找人冒充外甥", "向叶小姐求婚"],
             [tl("1908年农历六月十一","树林","杀害汤望之"),
              tl("1914年8月27日","范公馆","向叶小姐求婚"),
              tl("1914年8月28日凌晨","范公馆客房一","发现比利尸体并藏匿")],
             [rel("yesheep","恋人"), rel("guzhong","同事"), rel("fanyuqing","老板")]),

        char("guzhong", "谷重", "male", 28, False, False,
             "范裕庆的侄子，范公馆的常客。野心勃勃。",
             "你是范裕庆的侄子，一直觊觎范家财产。你想继承范家的一切。",
             [obj("gz",1,"找出每个命案真相。(5分)",5), obj("gz",2,"不被当作真凶。(5分)",5)],
             ["觊觎范家财产"],
             [tl("1914年8月27日","范公馆","在大厅茶座闲聊"),
              tl("1914年8月27日晚","范公馆","参加晚宴"),
              tl("1914年8月28日凌晨","范公馆大厅","目睹范裕庆坠楼")],
             [rel("fanyuqing","叔侄",True), rel("hezhen","堂妹",True), rel("gaoshengxiang","同事")]),

        char("hezhen", "禾珍", "female", 18, False, False,
             "范裕庆之女，性格温婉。不愿嫁给之赋。",
             "你是范裕庆的女儿，不想嫁给父亲指定的未婚夫之赋。你向赵小姐求助。",
             [obj("hz",1,"找出每个命案真相。(5分)",5), obj("hz",2,"不被当作真凶。(5分)",5)],
             ["不愿嫁给之赋", "向赵小姐求助"],
             [tl("1914年8月27日","马车/范公馆","去火车站接赵小姐"),
              tl("1914年8月27日晚","范公馆","参加晚宴"),
              tl("1914年8月28日凌晨","范公馆大厅","发现父亲坠楼")],
             [rel("fanyuqing","父女",True), rel("guzhong","堂兄",True), rel("zhaoluoyi","求助对象")]),

        char("yesheep", "叶小姐", "female", 28, False, False,
             "范公馆女管家，端庄美丽。高襄生的恋人。",
             "你是范公馆的女管家，多年前与高襄生在夜总会相遇。你接受了他的求婚，但有很多秘密。",
             [obj("ys2",1,"找出每个命案真相。(5分)",5)],
             ["曾是夜总会的服务生", "接受高襄生求婚"],
             [tl("1908年","爱蜜夜总会","与高襄生相遇"),
              tl("1914年8月27日晚","范公馆","接受高襄生求婚"),
              tl("1914年8月28日凌晨","范公馆","发现命案")],
             [rel("gaoshengxiang","恋人"), rel("fanyuqing","雇主")]),

        char("zhaoluoyi", "赵洛意", "female", 18, False, False,
             "山西富商之女，上海圣约翰大学学生。来武汉讨债。",
             "你是山西赵家的大小姐，父亲去世后家业困难，来武汉找范裕庆讨回父亲的投资。你在秋儿处收到神秘股票。",
             [obj("zly",1,"找到祁风失联真相。(5分)",5), obj("zly",2,"找到父亲投资去向。(2分)",2), obj("zly",3,"找出每个命案真相。(5分)",5)],
             ["拿到了神秘股票", "新闻原则:没有调查清楚的事不说"],
             [tl("1914年8月27日","范公馆","到达范公馆"),
              tl("1914年8月27日","歆生路","调查祁家"),
              tl("1914年8月28日凌晨","范公馆","发现命案")],
             [rel("hezhen","求助对象"), rel("songqun","记账先生")]),

        char("fanyuqing", "范裕庆", "male", 50, True, False,
             "永信融老板，范公馆主人。坠楼身亡。",
             "你是永信融的老板，公司即将破产。你在婚礼当晚从二层坠下，死在婚礼用品桌上。",
             [],
             ["公司即将破产", "对叶小姐有意"],
             [tl("1914年8月27日","范公馆","接待赵小姐"),
              tl("1914年8月27日晚","范公馆餐厅","举办晚宴"),
              tl("1914年8月28日凌晨","范公馆","从二层坠楼身亡")],
             [])
    ]
    for c in chars:
        save(SID, f"characters/{c['id']}.json", c)

    clues = [
        clue("cl_fanyuqing_body", "范裕庆尸体", "范裕庆从二层坠下，被桌上烛台尖刺扎入身体。", "searchable", True, ["truth_fanyuqing"]),
        clue("cl_bili_body", "之赋尸体", "在客房二发现之赋(比利)的尸体。", "searchable", True, ["truth_bili"]),
        clue("cl_hanging_woman", "毁容女尸", "梅花林中发现被绳子吊起的毁容女人，无法辨认面容。", "searchable", True, ["truth_hanging"]),
        clue("cl_stocks", "铁盒股票", "秋儿收到的铁盒中装有数百张美国贸易公司股票。", "searchable", False, []),
        clue("cl_missing_songqun", "宋群失踪", "赵家的记账先生宋群在到达范公馆后失踪。", "searchable", False, []),
        clue("cl_rope_dig", "绳子和花锄", "园丁房中少了一捆绳子和一把花锄。", "searchable", True, ["truth_hanging"])
    ]
    save(SID, "clues.json", clues)

    scenes = [
        scene("s_fan_mansion", "范公馆", "汉口范裕庆的宅邸，未通电，采用蜡烛与油灯照明。", "Republican era Hankou mansion interior, candlelight, oil painting style"),
        scene("s_hall", "大厅", "范公馆大厅，摆放婚礼用品的桌子所在。", "Republican era mansion hall with wedding decorations, oil painting style"),
        scene("s_meihua", "梅花林", "范公馆外的梅花林，发现毁容女尸之处。", "Plum blossom grove, oil painting style"),
        scene("s_restaurant", "餐厅", "范公馆餐厅，晚宴举行地。", "Republican era mansion dining room, oil painting style")
    ]
    save(SID, "scenes.json", scenes)

    save(SID, "phases.json", default_phases(
        ["cl_fanyuqing_body"],
        ["cl_bili_body", "cl_hanging_woman", "cl_stocks", "cl_missing_songqun", "cl_rope_dig"]
    ))
    save(SID, "flow.json", FLOW)

    save(SID, "truth.json", {
        "murdererCharIds": ["gaoshengxiang"],
        "method": "范裕庆从二层坠楼身亡(自杀或意外)。之赋(比利)被人杀死在客房。毁容女尸是宋群的妻子苕华，被人吊在梅花林。",
        "motive": "高襄生当年因汤望之威胁自己的地位而将其杀害。范裕庆因公司破产绝望。其他命案与范家的财产纠纷有关。",
        "crimeTimeline": [
            tl("1908年农历六月十一","树林","高襄生杀害汤望之"),
            tl("1914年8月28日凌晨","范公馆","范裕庆从二层坠下身亡"),
            tl("1914年8月28日凌晨","范公馆客房","之赋(比利)被杀"),
            tl("1914年8月28日清晨","范公馆梅花林","发现毁容女尸")
        ],
        "solutionChain": ["cl_fanyuqing_body", "cl_bili_body", "cl_hanging_woman"],
        "reveal": "范裕庆因永信融即将破产而绝望。高襄生是杀害汤望之的真凶，他当年因职场竞争痛下杀手。范公馆的连环命案与范家的财产纠葛密切相关。",
        "endings": [
            {"id": "end_good", "condition": {"kind": "always"}, "title": "真相揭晓", "narrative": "真相大白，范家的秘密被揭开。"},
            {"id": "end_bad", "condition": {"kind": "always"}, "title": "真相掩埋", "narrative": "真相被掩埋，范公馆的冤魂不散。"}
        ]
    })


# ============================================================
# SCRIPT 42: 双影共秀 (shuangyinggongxiu)
# ============================================================
def gen_shuangyinggongxiu():
    print("=== 42 双影共秀 ===")
    SID = "shuangyinggongxiu"
    save(SID, "meta.json", meta(SID, "双影共秀", "民国浙江·月秀村灵应祠命案", 5,
        "1914年10月17日，浙江青田「月秀村」灵应祠内，银蟾客被发现死于床上。鲛婵塑像失踪，两个容貌相似的「小菟」现身——真相在二十年的恩怨中浮现。",
        "Republican era Zhejiang mountain village with folklore, oil painting style"))

    chars = [
        char("yinchan", "银蟾客", "male", 64, True, False,
             "灵应祠祠主，游方先生。供奉鲛婵塑像。",
             "你是灵应祠的祠主，多年来主持祭赛。你被发现死在床上，颈部缠着腰带。",
             [],
             ["曾与素儿有不正当关系", "知道鲛婵的真相"],
             [tl("1890年","月秀村","感应湖中有非凡之物，建立灵应祠"),
              tl("1899年","灵应祠","昏迷后传达鲛婵要降凶灾"),
              tl("1914年10月17日","灵应祠","被发现死在床上")],
             []),

        char("suier", "素儿", "female", 38, False, True,
             "霓娥的义妹，灵应祠侍女。从小在竺家长大。",
             "你从小被霓娥带到竺家，后被送去灵应祠当侍女，实际上是银蟾客的侍妾。你恨霓娥的忘恩负义，为保护小菟而杀死银蟾客。你还曾杀死贾氏。",
             [obj("se",1,"隐瞒你杀了贾氏和银蟾客。(2x10分)",20), obj("se",2,"找出两个小菟的真实身份。(2x2分)",4)],
             ["杀死贾氏(1893年)", "杀死银蟾客", "曾把霓娥当最亲的人"],
             [tl("1893年农历七月初二","竺家柴房","用柴刀砍杀贾氏"),
              tl("1893年后","灵应祠","被送去当侍女"),
              tl("1914年10月17日","灵应祠正殿","用腰带勒死银蟾客")],
             [rel("niee","义姐/仇人"), rel("tonglang","义弟"), rel("xiaotu","养女")]),

        char("niee", "霓娥", "female", 47, True, False,
             "竺江善之妾，识字晓礼。住在竺家女眷房。",
             "你是竺江善的妾室，被白姐卖给竺家。你在祭赛当天被发现浮尸湖中。你当年曾许愿让鲛婵除掉贾氏。",
             [obj("ne",1,"找出每个命案真相。(5分)",5)],
             ["曾许愿除掉贾氏", "被银蟾客利用"],
             [tl("1881年","竺家","被卖给竺江善为妾"),
              tl("1893年农历七月初二","竺家","许愿除掉贾氏"),
              tl("1899年农历九月初一","映天湖","被发现浮尸湖中")],
             [rel("suier","义妹"), rel("zhujianshan","夫妻"), rel("tonglang","母子",True)]),

        char("tonglang", "童郎", "male", 20, False, False,
             "竺江善与霓娥之子，银蟾客的徒弟。",
             "你是竺家唯一幸存的孩子，在邬家寄人篱下后投奔灵应祠。你暗恋小菟，为她将吉旺推入湖中，还将鲛婵塑像沉入湖中。",
             [obj("tl",1,"找出银蟾客死亡真相。(5分)",5), obj("tl",2,"找出竺家惨案真相。(10分)",10), obj("tl",3,"隐瞒打伤吉旺和沉湖塑像。(2x2分)",4)],
             ["将吉旺推入湖中", "将鲛婵塑像沉入湖中", "暗恋小菟"],
             [tl("1899年农历九月初一","竺家","目睹惨案，身上染血"),
              tl("1910年","映天湖畔","将吉旺推入湖中"),
              tl("1914年10月","灵应祠","将鲛婵塑像沉入湖中")],
             [rel("suier","义姐",True), rel("niee","母亲"), rel("gongjing","养父")]),

        char("gongjing", "功靖", "male", 25, False, False,
             "邬入舟与竺氏之子，嫦儿的丈夫。",
             "你是邬家的少爷，娶了嫦儿，生了吉旺。你把银蟾客的病人送到灵应祠。",
             [obj("gj",1,"找出每个命案真相。(5分)",5)],
             ["知道竺家惨案的一些细节"],
             [tl("1899年农历九月初一","映天湖畔","参与祭赛"),
              tl("1914年10月16日","灵应祠","送病人来灵应祠")],
             [rel("tonglang","养父子",True), rel("nier","姑表亲")])
    ]
    for c in chars:
        save(SID, f"characters/{c['id']}.json", c)

    clues = [
        clue("cl_yinchan_body", "银蟾客尸体", "银蟾客死在正殿南侧屋竹床上，颈部缠着腰带。", "searchable", True, ["truth_yinchan"]),
        clue("cl_niee_body", "霓娥尸体", "霓娥的尸体在祭赛当天从映天湖中打捞上来。", "searchable", True, ["truth_niee"]),
        clue("cl_zhu_massacre", "竺家惨案", "竺家大门侧门从内插上，院内一地尸体，只有童郎活着。", "searchable", True, ["truth_zhu"]),
        clue("cl_statue_missing", "鲛婵塑像失踪", "灵应祠内殿中鲛婵塑像突然消失。", "searchable", False, []),
        clue("cl_two_xiaotu", "两个小菟", "井边出现两个容貌相似的小菟，一个蓬头乱发，一个赤足披红布。", "searchable", True, ["truth_xiaotu"]),
        clue("cl_jiaoshi_death", "贾氏之死", "贾氏被发现死在湖畔，竺江善断定是失足落水。", "searchable", True, ["truth_jiaoshi"])
    ]
    save(SID, "clues.json", clues)

    scenes = [
        scene("s_lingyingci", "灵应祠", "映天湖畔的祠堂，供奉鲛婵塑像。", "Chinese lakeside shrine, oil painting style"),
        scene("s_zhujia", "竺家", "月秀村竺家宅院，曾发生灭门惨案。", "Chinese mountain village mansion, oil painting style"),
        scene("s_lake", "映天湖", "月秀村北的湖泊，相传有水妖。", "Mountain lake reflecting sky, oil painting style"),
        scene("s_jiting", "祭亭", "映天湖畔的祭亭，祭赛举行地。", "Chinese lakeside pavilion for rituals, oil painting style")
    ]
    save(SID, "scenes.json", scenes)

    save(SID, "phases.json", default_phases(
        ["cl_yinchan_body"],
        ["cl_niee_body", "cl_zhu_massacre", "cl_statue_missing", "cl_two_xiaotu", "cl_jiaoshi_death"]
    ))
    save(SID, "flow.json", FLOW)

    save(SID, "truth.json", {
        "murdererCharIds": ["suier"],
        "method": "素儿用银蟾客的外衣腰带勒死他。贾氏则是被素儿用柴刀砍杀。霓娥被银蟾客设计害死。",
        "motive": "素儿恨霓娥将她送去灵应祠当侍妾，又恨银蟾客不放她自由。为保护小菟逃离，她杀死银蟾客。贾氏当年要杀霓娥，素儿为保护霓娥先下手为强。",
        "crimeTimeline": [
            tl("1893年农历七月初二","竺家柴房","素儿用柴刀砍杀贾氏"),
            tl("1899年农历九月初一","映天湖","霓娥被发现浮尸湖中(银蟾客设计)"),
            tl("1899年农历九月初一","竺家","竺家灭门惨案"),
            tl("1914年10月17日","灵应祠正殿","素儿用腰带勒死银蟾客")
        ],
        "solutionChain": ["cl_yinchan_body", "cl_jiaoshi_death", "cl_two_xiaotu"],
        "reveal": "素儿为保护小菟杀死银蟾客。贾氏当年要杀霓娥，素儿为保护霓娥用柴刀砍杀。竺家惨案的真相与鲛婵祭赛密切相关。两个小菟的身份之谜是解开一切的关键。",
        "endings": [
            {"id": "end_good", "condition": {"kind": "always"}, "title": "真相揭晓", "narrative": "灵应祠的秘密被揭开，素儿的罪行被揭露。"},
            {"id": "end_bad", "condition": {"kind": "always"}, "title": "真相掩埋", "narrative": "真相被掩埋，月秀村的传说继续流传。"}
        ]
    })


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    gen_duchong()
    gen_zhuyingezhuang()
    gen_lidisancun()
    gen_anboya()
    gen_qilushao()
    gen_shuangyinggongxiu()
    print("\n=== All 6 scripts generated ===")
