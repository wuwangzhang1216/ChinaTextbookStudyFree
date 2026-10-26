# #12 需要你配合的验收

先在[我的](https://d3nmsqi4n72idj.cloudfront.net/profile/)点“添加孩子”，新建测试档案，日常档案保留。不要清除浏览器数据。各项当前均为**待验收**，自动测试不能代替这些结果。

|谁来做 / 预计时间|具体操作|回传什么 / 判定|
|---|---|---|
|一年级孩子 + 家长 / 15分钟|走“一年级 → 数学上册修订版 → 在校园和教室里发现数学 → 开始”。见[当前首课](https://d3nmsqi4n72idj.cloudfront.net/lesson/g1up-2026/g1up-2026-u101-kp1/)。从“开始”到第一次自主判断并点楼层计时，成人不提示。旧版[点苹果](https://d3nmsqi4n72idj.cloudfront.net/lesson/g1up/g1up-u1-kp1/)仅单列对照|秒数、第一次犹豫或求助位置；目标30秒内，不能把点击下一步算学习动作|
|同一孩子 / 上述试用内|自然完成练习；如发生错误，完成纠错后问“第一次答对几题？后来改对了什么？”不要求故意答错|孩子原话；若全对，纠错理解记待测。成人解释后复述不算独立理解（UX-06）|
|孩子 + 家长 / 上述试用内|依次操作退出、保存、朗读、设置、下一课。再看下方10页，问“聪聪怎样帮你学习？”|误触次数、相邻按钮、需要帮助之处及孩子原话。尺寸通过不能代替拇指实测（UX-11/12）|
|对应学科教师 / 分批，每批20分钟|先审[本轮新增优先队列](teacher-priority.md)：默认首课、拼音四声与修正课；再按[原137课队列](../ux12-2026-10-25/teacher-queue.md)分科核对。独立作答，再看标准答案/解析，试听题目、选项和解析|`课时ID / 题号 / 语义通过或需改 / 朗读通过或需改 / 修改建议`。检查前提、参照方向、答案唯一性、适龄表达；尚未签审，不能勾UX-02/05|
|家长 / 手机10分钟；iPad6若有另10分钟|真实手机Safari/Chrome，选答案未检查时刷新；已检查后刷新；后台再切回；朗读/暂停；选择从未打开过的课或音频，在真实移动网络加载时断网，等错误提示再恢复并重试；如果已缓存而能继续播放，记“已缓存可离线”，另选未缓存内容，不清除浏览器数据。iPad6重复首次加载和播放|机型、系统/浏览器版本、步骤、等待秒数、可见错误；不能重复扣心、丢答案或误记播放完成。无设备填未测，不需购买（兼顾#3）|
|同一孩子 + 家长 / 次日及第7天，各5–10分钟|分别使用[无答案学生卡](delayed-student-cards.md)和[家长答案/记录表](delayed-parent-key.md)，每次6道新情境，不复述当天原题；家长可原样朗读但不提示方向/答案|首答、理由、是否朗读/提示、两次实际日期；证据不足时不宣称掌握。教师还需审这些验收卡|

## 10页品牌与用语抽查

成人每页记录“语气 / 聪聪作用 / 视觉是否像同一应用 / 不一致的具体元素”；儿童能否理解另记。无需上传学生姓名、录音或账号资料。

[年级](https://d3nmsqi4n72idj.cloudfront.net/grade/1/) · [教材路径](https://d3nmsqi4n72idj.cloudfront.net/book/g1up-2026/) · [默认首课](https://d3nmsqi4n72idj.cloudfront.net/lesson/g1up-2026/g1up-2026-u101-kp1/) · [知识手册](https://d3nmsqi4n72idj.cloudfront.net/book/g1up-2026/guide/101/) · [课文列表](https://d3nmsqi4n72idj.cloudfront.net/reading/chinese-g1up/) · [上学歌](https://d3nmsqi4n72idj.cloudfront.net/reading/chinese-g1up/chinese-g1up-p1/) · [故事列表](https://d3nmsqi4n72idj.cloudfront.net/stories/chinese-g1up/) · [门口的小伞](https://d3nmsqi4n72idj.cloudfront.net/stories/chinese-g1up/chinese-g1up-s1-v2/) · [错题本](https://d3nmsqi4n72idj.cloudfront.net/review/) · [聪聪衣橱](https://d3nmsqi4n72idj.cloudfront.net/shop/)。

## 可直接复制的反馈

```text
日期：
项目（教师 / 儿童 / 真机 / 次日 / 第7天 / 品牌）：
设备、系统、浏览器：
页面或课时ID、题号：
操作与实际结果：
等待秒数 / 误触次数 / 首答和解释 / 是否给过提示：
孩子原话或修改建议（可选）：
```

UX-02/05/06/07/11/12 保持未勾选；#12继续开放，原追踪自动化继续暂停。
