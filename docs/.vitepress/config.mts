import { defineConfig } from 'vitepress'

const gaId = process.env.VITEPRESS_GA_ID

export default defineConfig({
  title: 'JuryArena',
  description: 'An open-source arena-based evaluation tool for selecting LLMs using real-world prompts.',

  base: '/ele-cloud-autobench/',
  ignoreDeadLinks: [/^https?:\/\/localhost/],

  head: gaId
    ? [
        ['script', { async: '', src: `https://www.googletagmanager.com/gtag/js?id=${gaId}` }],
        ['script', {}, `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}');`],
      ]
    : [],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        sidebar: [
          {
            text: 'Getting Started',
            items: [
              { text: 'Overview', link: '/' },
              { text: 'Quick Start', link: '/quickstart' },
            ],
          },
          {
            text: 'Guide',
            items: [
              { text: 'Running Benchmarks', link: '/guides/running-benchmarks' },
              { text: 'Data Format', link: '/guides/data-format' },
              { text: 'LLM Configuration', link: '/guides/llm-configuration' },
              { text: 'Development', link: '/guides/development' },
            ],
          },
          {
            text: 'Concepts',
            items: [
              { text: 'Arena Evaluation', link: '/concepts/arena-evaluation' },
              { text: 'Rating System', link: '/concepts/rating-system' },
              { text: 'Terminology', link: '/concepts/terminology' },
            ],
          },
          {
            text: 'Architecture',
            items: [
              { text: 'System Architecture', link: '/architecture/system-architecture' },
              { text: 'Web Implementation', link: '/architecture/web-implementation' },
            ],
          },
        ],
      },
    },
    ja: {
      label: '日本語',
      lang: 'ja',
      description: '実際のプロンプトを用いてLLMを選定するための、アリーナ形式のオープンソース評価ツール。',
      themeConfig: {
        sidebar: [
          {
            text: 'はじめに',
            items: [
              { text: '概要', link: '/ja/' },
              { text: 'クイックスタート', link: '/ja/quickstart' },
            ],
          },
          {
            text: 'ガイド',
            items: [
              { text: 'ベンチマーク実行', link: '/ja/guides/running-benchmarks' },
              { text: 'データフォーマット', link: '/ja/guides/data-format' },
              { text: 'LLM設定', link: '/ja/guides/llm-configuration' },
              { text: '開発手順', link: '/ja/guides/development' },
            ],
          },
          {
            text: 'コンセプト',
            items: [
              { text: 'アリーナ評価とは', link: '/ja/concepts/arena-evaluation' },
              { text: 'レーティングシステム', link: '/ja/concepts/rating-system' },
              { text: '用語集', link: '/ja/concepts/terminology' },
            ],
          },
          {
            text: 'アーキテクチャ',
            items: [
              { text: '全体設計', link: '/ja/architecture/system-architecture' },
              { text: 'Web実装方針', link: '/ja/architecture/web-implementation' },
            ],
          },
        ],
        outlineTitle: '目次',
        docFooter: {
          prev: '前のページ',
          next: '次のページ',
        },
      },
    },
  },

  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Liquid-dev/ele-cloud-autobench' },
    ],

    search: {
      provider: 'local',
      options: {
        locales: {
          ja: {
            translations: {
              button: {
                buttonText: '検索',
                buttonAriaLabel: '検索',
              },
              modal: {
                displayDetails: '詳細を表示',
                resetButtonTitle: 'リセット',
                backButtonTitle: '戻る',
                noResultsText: '結果が見つかりません',
                footer: {
                  selectText: '選択',
                  navigateText: '移動',
                  closeText: '閉じる',
                },
              },
            },
          },
        },
      },
    },
  },
})
