export const layoutMessages = {
  zh: {
    cards: '卡片与内容层级',
    cardDescription: '标题、描述、内容与操作在同一组件中组合。',
    content: '这是一段可读的合成内容，可在桌面和窄屏检查留白与排版。',
    openList: '打开列表场景',
    collapse: '可折叠区域',
    collapseDescription: '受控展开状态与禁用状态，标题按钮支持键盘。',
    collapsedTitle: '展开更多内容',
    disabledTitle: '不可用的折叠区',
    height: '自适应高度',
    heightDescription: '内容变化时平滑调整高度，并尊重系统减少动态效果设置。',
    add: '增加一段内容',
    remove: '减少一段内容',
    paragraph: '合成段落 {number}：组件随着内容增加保持稳定的布局和可读性。',
    gutter: '响应式页面留白',
    gutterDescription: '使用与后台相同的响应式 Gutter，在窄屏也能访问完整内容。',
    gutterContent: '与管理后台正文一致的内容边距。',
  },
  en: {
    cards: 'Cards and content hierarchy',
    cardDescription: 'Compose titles, descriptions, content and actions with the same component.',
    content:
      'This readable synthetic content helps inspect spacing and typography on desktop and narrow screens.',
    openList: 'Open list example',
    collapse: 'Collapsible sections',
    collapseDescription:
      'Controlled expansion and disabled states, with keyboard-accessible headings.',
    collapsedTitle: 'Show additional content',
    disabledTitle: 'Unavailable section',
    height: 'Animated content height',
    heightDescription:
      'Height follows content changes and respects the system reduced-motion preference.',
    add: 'Add a paragraph',
    remove: 'Remove a paragraph',
    paragraph:
      'Synthetic paragraph {number}: content grows while preserving a stable, readable layout.',
    gutter: 'Responsive gutters',
    gutterDescription:
      'The same responsive Gutter keeps full content accessible on narrow screens.',
    gutterContent: 'Content spacing matches the administration interface.',
  },
} as const;
