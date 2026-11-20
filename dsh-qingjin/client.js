window.__ModuleLoader__.load({
  id: '@wocao123103/dsh-qingjin',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const KIND = 'qingjin'
    const TAB_ID = '@wocao123103/dsh-qingjin/panel'
    const CLIENT_VERSION = 'v0.12.0'

    // 蓝色为主、暖橙作点缀的“大肥鱼”配色。all values are self-contained so the
    // panel keeps its identity in both light and dark shells.
    const FISH = {
      deep: '#0f2f4a',
      sea: '#1b5e8c',
      sky: '#3b9ad9',
      foam: '#bfe3f7',
      blush: '#f2a3a3',
      gold: '#f0b95c',
      belly: '#f7fbfe',
    }

    const isZh = () => true // replaced at apply time from the Client locale service

    const ZH_COPY = {
        tab: '青衿科研',
        launch: '论文',
        title: '青衿科研 · 论文工作台',
        subtitle: '大肥鱼陪你写论文',
        hint: '选一个动作、填好内容，复制提示词后粘到输入框发送。工具会真的产出骨架 / 句式 / 诊断。',
        modes: [
          { id: 'outline', label: '论文骨架', placeholder: '题目或研究方向，例如：基于视觉的船舶焊缝缺陷检测' },
          { id: 'proposal', label: '大创申报书', placeholder: '项目方向，例如：海洋工程' },
          { id: 'template-md', label: '论文模板', placeholder: '题目；会生成可填写的 Markdown 成稿模板' },
          { id: 'template-tex', label: 'LaTeX 模板', placeholder: '题目；会生成可编译的 .tex 并用 latex_look 检查版面' },
          { id: 'phrase', label: '英文句式', placeholder: '可留空；或写你要表达的意图，例如：指出研究空白' },
          { id: 'glossary', label: '术语对照', placeholder: '中英文均可，例如 proof rate 或 混合执行' },
          { id: 'check', label: '段落自检', placeholder: '粘贴一段要检查的文字（建议 100 词以上）' },
          { id: 'translate', label: '译文校核', placeholder: '粘贴你翻好的中文译文，核对数字、术语与比较方向' },
          { id: 'rules', label: '骨架与排版', placeholder: '规则说明，无需输入' },
          { id: 'workflow', label: '任务分工', placeholder: '描述你现在的任务，例如：这个选题值不值得做' },
          { id: 'humanize', label: '去 AI 味', placeholder: '粘贴一段你自己写的正文，诊断模板句与防御性表达' },
          { id: 'pdf', label: 'PDF 精读', placeholder: '粘贴 PDF 路径，例如 C:\\Users\\你\\Downloads\\2412.15931.pdf' },
          { id: 'related', label: '同方向顶刊', placeholder: '论文标题 / DOI / 方向关键词，例如 混合模糊测试' },
        ],
        copy: '复制提示词',
        copied: '已复制，去输入框粘贴发送',
        failed: '复制失败，请手动选中复制',
        preview: '将要发送的内容',
        footerNote: '本地插件 · 仅「同方向顶刊」联网',
      }

    const EN_COPY = {
        tab: 'Qingjin Research',
        launch: 'Paper',
        title: 'Qingjin Research · paper workbench',
        subtitle: 'The fat fish writes with you',
        hint: 'Pick an action, fill in the text, copy the prompt and paste it into the composer. The tools really produce skeletons, phrases and diagnostics.',
        modes: [
          { id: 'outline', label: 'Paper outline', placeholder: 'Title or direction, e.g. vision-based weld defect detection' },
          { id: 'proposal', label: 'Proposal', placeholder: 'Project direction' },
          { id: 'template-md', label: 'Draft template', placeholder: 'Title; generates a fill-in Markdown draft' },
          { id: 'template-tex', label: 'LaTeX template', placeholder: 'Title; generates a compile-ready .tex and checks it with latex_look' },
          { id: 'phrase', label: 'English phrases', placeholder: 'Optional: what you want to express' },
          { id: 'glossary', label: 'Terminology', placeholder: 'English or Chinese, e.g. proof rate' },
          { id: 'check', label: 'Paragraph check', placeholder: 'Paste a paragraph to check (100+ words)' },
          { id: 'translate', label: 'Translation check', placeholder: 'Paste your Chinese translation to verify numbers, terms and comparison direction' },
          { id: 'rules', label: 'Rules', placeholder: 'Reference only, no input needed' },
          { id: 'workflow', label: 'Route task', placeholder: 'Describe the task, e.g. is this idea worth pursuing?' },
          { id: 'humanize', label: 'De-AI prose', placeholder: 'Paste a paragraph you wrote; find template phrases and defensive framing' },
          { id: 'pdf', label: 'Read PDF', placeholder: 'Paste the PDF path, e.g. C:\\Users\\you\\Downloads\\paper.pdf' },
          { id: 'related', label: 'Field papers', placeholder: 'Title, DOI or direction keywords' },
        ],
        copy: 'Copy prompt',
        copied: 'Copied — paste it into the composer',
        failed: 'Copy failed; select and copy manually',
        preview: 'What will be sent',
        footerNote: 'Local plugin · only Field papers goes online',
      }

    // Chosen in apply() from the Client locale service; components read it when
    // they render, so the labels follow the app language rather than navigator.
    let COPY = ZH_COPY

    const ZH_RULES = [
      {
        group: '骨架规则',
        items: [
          '一篇只讲一个贡献，标题就是这句贡献的陈述句。',
          '摘要：背景 → 目标 → 方法 → 结果（含数字）→ 结论，不放引用。',
          '引言：CARS 三步（建立领域 → 建立空白 → 占据空白）。',
          '方法过去时、结果过去时、引言与讨论现在时。',
          '结果一段一个陈述句小标题，段末一句结论。',
          '篇幅预算：摘要 5%、引言 15%、方法 20%、结果 30%、讨论 25%、结论 5%。',
        ],
      },
      {
        group: '排版（中文 Word）',
        items: [
          'A4；页边距上下 2.54 cm、左右 3.17 cm。',
          '正文宋体小四 12 pt，英文 Times New Roman 12 pt，行距 1.5 倍。',
          '标题：一级黑体三号居中，二级黑体四号，三级黑体小四。',
          '图题在图下方、五号居中；表用三线表，表题在表上方。',
          '量与单位之间空一格；百分号紧跟数字。',
          '参考文献 GB/T 7714：作者. 题名[J]. 刊名, 年, 卷(期): 页码。',
        ],
      },
      {
        group: '投稿模板（四家实测）',
        items: [
          'CVPR/ICCV：双栏 10pt；题注 Figure 1.（句点）；编号 [1]；摘要 190–230 词。',
          'ECCV：LNCS 双栏；题注 Fig. 1:（冒号）；编号 [1]；附录不计正文。',
          'AAAI：双栏 10pt；题注 Figure 1:（冒号）；作者-年份；摘要 150–200 词。',
          'ICML：PMLR 双栏；题注 Figure 1.（句点）；作者-年份；常要 Broader Impact。',
        ],
      },
      {
        group: 'LaTeX 默认',
        items: [
          '中文 ctexart 11pt / 英文 article 11pt，A4，边距 2.5 cm。',
          '图题在图下、表用 booktabs；参考文献先给 thebibliography。',
        ],
      },
    ]

    const EN_RULES = [
      {
        group: 'Skeleton rules',
        items: [
          'One contribution per paper; the title states it as a claim.',
          'Abstract: background → objective → method → results (with numbers) → conclusion.',
          'Introduction: CARS (territory → niche → occupation).',
          'Past tense for methods and results; present for introduction and discussion.',
          'One claim-style heading per results paragraph, ending with its conclusion.',
          'Word budget: abstract 5%, intro 15%, methods 20%, results 30%, discussion 25%, conclusion 5%.',
        ],
      },
      {
        group: 'Typography (English)',
        items: [
          'A4 or Letter; 1 inch margins.',
          'Body: Times New Roman 12 pt, double-spaced, left-aligned.',
          'Headings bold: 14 pt level 1, 12 pt level 2.',
          'Figure captions below, table captions above, three-line tables.',
          'Space between value and unit; percent sign attached.',
          'One reference style throughout (IEEE or APA).',
        ],
      },
      {
        group: 'Venue templates (measured)',
        items: [
          'CVPR/ICCV: two columns, 10 pt; captions "Figure 1."; numbered [1]; abstract 190–230 words.',
          'ECCV: LNCS two columns; captions "Fig. 1:"; numbered [1]; appendix outside the page limit.',
          'AAAI: two columns, 10 pt; captions "Figure 1:"; author-year; abstract 150–200 words.',
          'ICML: PMLR two columns; captions "Figure 1."; author-year; Broader Impact expected.',
        ],
      },
      {
        group: 'LaTeX defaults',
        items: [
          'Chinese ctexart 11pt / English article 11pt, A4, 2.5 cm margins.',
          'Figure captions below, booktabs tables, thebibliography first.',
        ],
      },
    ]

    function pickCopy(ctx) {
      const read = () => {
        try {
          const snapshot = ctx.locale?.getLocale?.() ?? ctx.locale?.getSnapshot?.()
          const candidate = snapshot?.id ?? snapshot?.locale ?? snapshot?.current ?? snapshot?.value
          if (typeof candidate === 'string' && candidate.length > 0) return candidate
        } catch { /* locale unavailable */ }
        try { return String(navigator.language ?? '') } catch { return '' }
      }
      const id = String(read() ?? '').toLowerCase()
      if (id.startsWith('zh')) return ZH_COPY
      if (id.length > 0) return EN_COPY
      return ZH_COPY
    }

    function buildPrompt(mode, text) {
      const value = (text ?? '').trim()
      if (mode === 'outline') {
        return value
          ? `用 qingjin_outline 帮我起一篇论文的骨架，题目：${value}，目标 5000 词。`
          : '用 qingjin_outline 帮我起一篇论文的骨架，我还没定题目，先给我三个可做的方向。'
      }
      if (mode === 'proposal') {
        return value
          ? `用 qingjin_outline（kind=proposal）帮我写大创申报书骨架，方向：${value}。`
          : '用 qingjin_outline（kind=proposal）帮我写大创申报书骨架。'
      }
      if (mode === 'template-md') {
        return value
          ? `用 qingjin_template（kind=paper, format=md）生成论文模板，题目：${value}，把它写成一个 .md 文件。`
          : '用 qingjin_template（kind=paper, format=md）生成论文模板，题目先留空。'
      }
      if (mode === 'template-tex') {
        return value
          ? `用 qingjin_template（kind=paper, format=tex）生成 LaTeX 论文模板，题目：${value}，写成 main.tex，然后用 latex_look 编译检查版面。`
          : '用 qingjin_template（kind=paper, format=tex）生成 LaTeX 论文模板，写成 main.tex 并用 latex_look 检查。'
      }
      if (mode === 'phrase') {
        return value
          ? `用 qingjin_phrase 给我几句英文句式，意图是：${value}，section=intro。`
          : '用 qingjin_phrase 给我几句指出研究空白的英文句式，section=intro, intent=gap。'
      }
      if (mode === 'glossary') {
        return value
          ? `用 qingjin_glossary 查这几个术语的标准中文译法和常见误译：${value}。`
          : '用 qingjin_glossary 给我几个写论文最常用的术语对照，中英各列一栏。'
      }
      if (mode === 'translate') {
        return value
          ? `用 qingjin_check（section=translation）校核这段译文，重点看数字、术语与比较方向：\n\n${value}`
          : '用 qingjin_check（section=translation）校核我接下来贴的中文译文。'
      }
      if (mode === 'rules') {
        return '用 qingjin_rules 输出完整的骨架生成规则、中英文排版规则与 LaTeX 模板默认设置。'
      }
      if (mode === 'related') {
        return value
          ? `用 qingjin_related 联网查这篇论文所在方向的其它高质量论文：${value}\n要标出 venue 等级（A/B 档）、开放获取下载链接，并把预印本单独列出；最后说明等级来自插件内置的 CCF 简化对照表。`
          : '用 qingjin_related 帮我查一个方向的高质量论文，我先给你关键词。'
      }
      if (mode === 'workflow') {
        return value
          ? `用 qingjin_workflow 帮我把这个任务分到对应阶段并给出下一步：${value}\n如果涉及评审，用 mode=review 的七维骨架；涉及投稿，用 mode=venues 对一下 CVPR/ICLR/AAAI 的差异。`
          : '用 qingjin_workflow 列出 18 个技能的分工，让我挑一个现在的任务。'
      }
      if (mode === 'humanize') {
        return value
          ? `用 qingjin_humanize 诊断这段文字里的模板句与防御性表达，给出改写方向，并说明哪些内容必须保留：\n\n${value}`
          : '用 qingjin_humanize 诊断我接下来贴的正文。'
      }
      if (mode === 'pdf') {
        return value
          ? `精读这个 PDF：${value}\n用 qingjin_pdf_read 读全文，写成一篇完整的中文精读文章（1500–3000 字），结构：一句话结论 / 研究问题与动机 / 方法拆解（每条配原文英文短引+中译）/ 实验与数据 / 主要结果（表格）/ 贡献 / 局限 / 与同方向工作的位置（可用 qingjin_related 补 2–3 篇对照）/ 可复用写作句式 / 术语表。\n把文章存成 精读-短标题.md，放在该 PDF 的同一个文件夹；再用 qingjin_export 生成同名 .pdf，最后把两个路径都告诉我。元信息用列表写，不要用引用块。`
          : '我想精读一篇论文 PDF：告诉我该把文件放哪、路径怎么写，然后我给出完整精读文章（md + pdf，放在原文同目录）。'
      }
      return value
        ? `用 qingjin_check 检查这段文字，section=results：\n\n${value}`
        : '用 qingjin_check 检查我接下来贴的段落；先告诉我应该归到哪一节（abstract/introduction/methods/results/discussion/conclusion/translation）。'
    }

    const CSS = `
@keyframes qj-swim { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-4px) rotate(2deg)} }
@keyframes qj-bubble { 0%{opacity:0;transform:translateY(2px)} 40%{opacity:.9} 100%{opacity:0;transform:translateY(-10px)} }
.qj-fish{animation:qj-swim 3.6s ease-in-out infinite}
.qj-bubble{animation:qj-bubble 2.4s ease-out infinite}
.qj-pill:hover{filter:brightness(1.08)}
.qj-pill:active{transform:translateY(1px)}
.qj-btn:hover{filter:brightness(1.06)}
`

    const styles = {
      root: {
        display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', fontSize: '13px',
        color: 'inherit', height: '100%', boxSizing: 'border-box', overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(59,154,217,0.10), rgba(27,94,140,0.04) 55%, transparent)',
      },
      header: {
        display: 'flex', alignItems: 'center', gap: '10px',
        position: 'sticky', top: '-14px', zIndex: 2, margin: '-14px -14px 0', padding: '12px 14px 10px',
        background: 'linear-gradient(180deg, rgba(59,154,217,0.16), rgba(59,154,217,0.06))',
        backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(59,154,217,0.18)',
      },
      divider: { height: 1, background: 'linear-gradient(90deg, transparent, rgba(59,154,217,0.35), transparent)' },
      footer: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', opacity: 0.55, paddingTop: '2px' },
      badge: {
        padding: '1px 7px', borderRadius: '999px', border: '1px solid rgba(59,154,217,0.5)',
        color: FISH.sea, fontSize: '10px', lineHeight: '16px',
      },
      mascot: { flex: '0 0 auto', display: 'block' },
      headText: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
      title: { fontSize: '14px', fontWeight: 650, color: FISH.sea, letterSpacing: '0.01em' },
      subtitle: { fontSize: '11px', opacity: 0.6 },
      hint: { opacity: 0.68, lineHeight: 1.55 },
      modes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
      mode: (active) => ({
        padding: '7px 10px', borderRadius: '10px', fontSize: '12px', cursor: 'pointer',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        border: '1px solid ' + (active ? FISH.sky : 'rgba(59,154,217,0.32)'),
        background: active ? `linear-gradient(135deg, ${FISH.sky}, ${FISH.sea})` : 'rgba(59,154,217,0.07)',
        color: active ? '#fff' : 'inherit',
        boxShadow: active ? '0 2px 8px rgba(27,94,140,0.28)' : 'none',
        transition: 'filter .15s ease, transform .08s ease',
        opacity: active ? 1 : 0.88,
      }),
      input: {
        width: '100%', minHeight: '96px', resize: 'vertical', boxSizing: 'border-box',
        padding: '9px 11px', borderRadius: '10px', fontSize: '13px', lineHeight: 1.55,
        border: '1px solid rgba(59,154,217,0.35)', background: 'rgba(255,255,255,0.04)', color: 'inherit',
        fontFamily: 'inherit', outline: 'none',
      },
      button: {
        padding: '8px 16px', borderRadius: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
        border: '1px solid ' + FISH.sky, color: '#fff',
        background: `linear-gradient(135deg, ${FISH.sky}, ${FISH.sea})`,
        boxShadow: '0 2px 10px rgba(27,94,140,0.3)',
        transition: 'filter .15s ease, transform .08s ease',
      },
      preview: {
        padding: '9px 11px', borderRadius: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        border: '1px dashed rgba(59,154,217,0.45)', background: 'rgba(191,227,247,0.07)',
        opacity: 0.9, lineHeight: 1.55, maxHeight: '180px', overflowY: 'auto',
      },
      status: { fontSize: '12px', color: FISH.sea, opacity: 0.85 },
      rules: {
        padding: '10px 12px', borderRadius: '10px', lineHeight: 1.65, fontSize: '12.5px',
        border: '1px solid rgba(59,154,217,0.28)', background: 'rgba(191,227,247,0.06)',
      },
      rulesGroup: { fontWeight: 650, marginBottom: '4px', color: FISH.sea, opacity: 0.95 },
      ruleItem: { opacity: 0.82, marginBottom: '2px' },
    }

    /** 大肥鱼：圆滚滚的鲸鱼，带腮红和一个小气泡。纯 SVG，无外部资源。 */
    function Mascot() {
      return h('svg', {
        className: 'qj-fish', width: 46, height: 46, viewBox: '0 0 64 64',
        role: 'img', 'aria-label': '大肥鱼', style: styles.mascot,
      },
        h('ellipse', { cx: 30, cy: 34, rx: 20, ry: 17, fill: FISH.sea }),
        h('ellipse', { cx: 29, cy: 40, rx: 15, ry: 10, fill: FISH.belly, opacity: 0.92 }),
        h('path', { d: 'M50 30c6-5 9-2 9 4 0 6-4 9-9 5z', fill: FISH.sky }),
        h('path', { d: 'M16 24c-2-6 3-9 8-8-2 4-2 7-2 10z', fill: FISH.sky, opacity: 0.9 }),
        h('circle', { cx: 38, cy: 31, r: 3.2, fill: '#fff' }),
        h('circle', { cx: 39, cy: 31, r: 1.6, fill: FISH.deep }),
        h('circle', { cx: 22, cy: 36, r: 3, fill: FISH.blush, opacity: 0.65 }),
        h('path', { d: 'M26 42q3 3 6 0', stroke: FISH.deep, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', opacity: 0.5 }),
        h('circle', { className: 'qj-bubble', cx: 54, cy: 16, r: 2.4, fill: FISH.foam }),
        h('circle', { className: 'qj-bubble', cx: 58, cy: 22, r: 1.6, fill: FISH.foam, style: { animationDelay: '0.8s' } }),
      )
    }

    function Workbench() {
      const [mode, setMode] = React.useState('outline')
      const [text, setText] = React.useState('')
      const [status, setStatus] = React.useState('')
      const active = COPY.modes.find((item) => item.id === mode) ?? COPY.modes[0]
      const prompt = buildPrompt(mode, text)
      const isRules = mode === 'rules'
      const ruleGroups = COPY === ZH_COPY ? ZH_RULES : EN_RULES

      const copy = () => {
        const done = () => { setStatus(COPY.copied); setTimeout(() => setStatus(''), 2200) }
        const failed = () => { setStatus(COPY.failed); setTimeout(() => setStatus(''), 3200) }
        try {
          const result = navigator.clipboard?.writeText(prompt)
          if (result && typeof result.then === 'function') result.then(done, failed)
          else done()
        } catch { failed() }
      }

      const rulesBlock = h('div', { style: styles.rules },
        ruleGroups.map((group) => h('div', { key: group.group, style: { marginBottom: '10px' } },
          h('div', { style: styles.rulesGroup }, group.group),
          group.items.map((item) => h('div', { key: item, style: styles.ruleItem }, '· ' + item)),
        )),
      )

      return h('div', { style: styles.root },
        h('style', { key: 'qj-style' }, CSS),
        h('div', { style: styles.header },
          h(Mascot),
          h('div', { style: styles.headText },
            h('div', { style: styles.title }, COPY.title),
            h('div', { style: styles.subtitle }, COPY.subtitle),
          ),
        ),
        h('div', { style: styles.hint }, COPY.hint),
        h('div', { style: styles.modes }, COPY.modes.map((item) => h('button', {
          key: item.id,
          type: 'button',
          className: 'qj-pill',
          title: item.label,
          style: styles.mode(item.id === mode),
          onClick: () => { setMode(item.id); setStatus('') },
        }, item.label))),
        isRules
          ? rulesBlock
          : h('textarea', {
            style: styles.input,
            value: text,
            placeholder: active.placeholder,
            onChange: (event) => { setText(event.target.value); setStatus('') },
          }),
        !isRules && h('div', { style: styles.hint }, COPY.preview),
        !isRules && h('div', { style: styles.preview }, prompt),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          h('button', { type: 'button', className: 'qj-btn', style: styles.button, onClick: copy }, COPY.copy),
          h('span', { style: styles.status }, status),
        ),
        h('div', { style: styles.divider }),
        h('div', { style: styles.footer },
          h('span', { style: styles.badge }, CLIENT_VERSION),
          h('span', null, COPY.footerNote),
        ),
      )
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'locale'],
      apply(ctx) {
        COPY = pickCopy(ctx)
        try {
          ctx.effect(() => {
            const dispose = ctx.locale?.subscribe?.(() => { COPY = pickCopy(ctx) })
            return () => { try { dispose?.() } catch { /* noop */ } }
          })
        } catch { /* locale optional */ }

        const openPanel = () => {
          try { ctx.sidebarRight.openTab(KIND) } catch { /* sidebar unavailable */ }
        }

        const Launch = () => h('button', {
          type: 'button',
          title: COPY.tab,
          onClick: openPanel,
          className: 'qj-pill',
          style: {
            display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px',
            borderRadius: '999px', fontSize: '12px', cursor: 'pointer', color: FISH.sea, fontWeight: 600,
            border: '1px solid ' + FISH.sky,
            background: `linear-gradient(135deg, rgba(191,227,247,0.55), rgba(59,154,217,0.22))`,
          },
        },
          h('svg', {
            width: 15, height: 15, viewBox: '0 0 24 24', 'aria-hidden': true,
          },
            h('ellipse', { cx: 11, cy: 13, rx: 7.5, ry: 6, fill: FISH.sea }),
            h('path', { d: 'M18 10.5c2.6-2 4 -0.6 4 2.5 0 3-1.6 4.2-4 2.4z', fill: FISH.sky }),
            h('circle', { cx: 14, cy: 11.4, r: 1.5, fill: '#fff' }),
            h('circle', { cx: 14.5, cy: 11.4, r: 0.8, fill: FISH.deep }),
          ),
          COPY.launch,
        )

        ctx.effect(() => {
          const release = ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: KIND,
            title: () => COPY.tab,
            guide: [{ id: 'qingjin', label: COPY.tab, description: COPY.hint }],
          })
          return () => { try { release() } catch { /* noop */ } }
        })

        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: TAB_ID },
          Workbench,
        ))

        ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
          { name: 'conversation.input.right', id: 'qingjin-launch', order: 20, label: COPY.launch },
          Launch,
        ))
      },
    }
  },
})
