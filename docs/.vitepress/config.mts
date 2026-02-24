import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'JuryArena',
  description: 'An open-source arena-based evaluation tool for selecting LLMs using real-world prompts.',

  base: '/jury-arena/',
  ignoreDeadLinks: [/^https?:\/\/localhost/],

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
          }
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
      { icon: 'github', link: 'https://github.com/elementshq/jury-arena' },
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
