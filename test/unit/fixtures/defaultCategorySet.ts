// A faithful TS reproduction of the live "default" CategorySet pulled directly
// from a real aw-server install (`GET /api/0/settings/category_sets`) during
// the investigation into why the Productivity Dashboard showed most activity
// as Uncategorized despite matching category rules existing. Used by both the
// migration tests (before/after class assignments) and the classifier
// regression tests (antigravity, YouTube-title-without-a-web-watcher, vim),
// so those tests exercise the exact shape of data that exposed the bug rather
// than an idealized fixture.
import { Category } from '~/util/classes';

export const liveDefaultCategorySet: Category[] = [
  {
    id: 0,
    name: ['Work'],
    rule: { type: 'regex', regex: 'Google Docs|libreoffice|ReText' },
    data: { color: '#0F0', score: 10 },
  },
  {
    id: 1,
    name: ['Work', 'Programming'],
    rule: {
      type: 'regex',
      regex: 'GitHub|Stack Overflow|BitBucket|Gitlab|vim|Spyder|kate|Ghidra|Scite',
    },
  },
  {
    id: 2,
    name: ['Work', 'Programming', 'ActivityWatch'],
    rule: { type: 'regex', regex: 'ActivityWatch|aw-', ignore_case: true },
  },
  { id: 3, name: ['Work', 'Image'], rule: { type: 'regex', regex: 'GIMP|Inkscape' } },
  { id: 4, name: ['Work', 'Video'], rule: { type: 'regex', regex: 'Kdenlive' } },
  { id: 5, name: ['Work', 'Audio'], rule: { type: 'regex', regex: 'Audacity' } },
  { id: 6, name: ['Work', '3D'], rule: { type: 'regex', regex: 'Blender' } },
  { id: 7, name: ['Media'], rule: { type: 'none' }, data: { color: '#F33' } },
  {
    id: 8,
    name: ['Media', 'Games'],
    rule: { type: 'regex', regex: 'Minecraft|RimWorld' },
    data: { color: '#F80' },
  },
  {
    id: 9,
    name: ['Media', 'Video'],
    rule: { type: 'regex', regex: 'YouTube|Plex|VLC' },
    data: { color: '#F33' },
  },
  {
    id: 10,
    name: ['Media', 'Social Media'],
    rule: { type: 'regex', regex: 'reddit|Facebook|Twitter|Instagram|devRant', ignore_case: true },
    data: { color: '#FCC400' },
  },
  {
    id: 11,
    name: ['Media', 'Music'],
    rule: { type: 'regex', regex: 'Spotify|Deezer' },
    data: { color: '#A8FC00' },
  },
  { id: 12, name: ['Comms'], rule: { type: 'none' }, data: { color: '#9FF' } },
  {
    id: 13,
    name: ['Comms', 'IM'],
    rule: {
      type: 'regex',
      regex:
        'Messenger|Telegram|Signal|WhatsApp|Rambox|Slack|Riot|Element|Discord|Nheko|NeoChat|Mattermost',
    },
  },
  {
    id: 14,
    name: ['Comms', 'Email'],
    rule: { type: 'regex', regex: 'Gmail|Thunderbird|mutt|alpine' },
  },
  { id: 15, name: ['Uncategorized'], rule: { type: 'none' } },
  {
    id: 16,
    name: ['Media', 'Video & Media Streaming'],
    rule: {
      type: 'regex',
      regex:
        'youtube\\.com|netflix\\.com|primevideo\\.com|hotstar\\.com|spotify\\.com|twitch\\.tv|vimeo\\.com',
    },
    data: { class: 'distraction' },
  },
  {
    id: 17,
    name: ['Media', 'Shopping & E-Commerce'],
    rule: {
      type: 'regex',
      regex:
        'amazon\\.in|flipkart\\.com|meesho\\.com|myntra\\.com|ajio\\.com|nykaa\\.com|jiomart\\.com|blinkit|zepto|bigbasket',
    },
    data: { class: 'distraction' },
  },
  {
    id: 18,
    name: ['Media', 'Games', 'Gaming & Casual Breaks'],
    rule: { type: 'regex', regex: 'chess\\.com|steam|epicgames|valheim|pubg|leetsync' },
    data: { class: 'distraction' },
  },
  {
    id: 19,
    name: ['Work', 'Programming', 'Editors & IDEs'],
    rule: {
      type: 'regex',
      regex: 'code|cursor|vscodium|pycharm|intellij|webstorm|jetbrains|antigravity',
    },
    data: { class: 'focus' },
  },
  {
    id: 20,
    name: ['Work', 'Programming', 'Terminals & Shells'],
    rule: { type: 'regex', regex: 'terminal|tmux|nvim|vim' },
    data: { class: 'focus' },
  },
  {
    id: 21,
    name: ['Work', 'Programming', 'Repos & Debugging'],
    rule: { type: 'regex', regex: 'github|gitlab|stackoverflow|bitbucket' },
    data: { class: 'focus' },
  },
  {
    id: 22,
    name: ['Work', 'Programming', 'Local Dev & APIs'],
    rule: { type: 'regex', regex: 'localhost|localhost:\\d+|docs|127\\.0\\.0\\.1' },
    data: { class: 'focus' },
  },
  {
    id: 23,
    name: ['Work', 'Document Viewers'],
    rule: { type: 'regex', regex: 'evince|okular|atril|zathura|mupdf' },
    data: { class: 'focus' },
  },
  {
    id: 24,
    name: ['Work', 'Drafting Tools'],
    rule: { type: 'regex', regex: 'org\\.gnome\\.TextEditor|gedit|kate' },
    data: { class: 'focus' },
  },
  {
    id: 25,
    name: ['Work', 'Chat & Messaging'],
    rule: { type: 'regex', regex: 'whatsapp|slack|discord|telegram|skype' },
    data: { class: 'operational' },
  },
  {
    id: 26,
    name: ['Work', 'Emails'],
    rule: { type: 'regex', regex: 'gmail|outlook|thunderbird' },
    data: { class: 'operational' },
  },
  {
    id: 27,
    name: ['Work', 'Meetings & Video'],
    rule: { type: 'regex', regex: 'zoom|meet|teams' },
    data: { class: 'operational' },
  },
  {
    id: 28,
    name: ['Work', 'Project Management'],
    rule: { type: 'regex', regex: 'jira|trello|asana|clickup|notion|linear' },
    data: { class: 'focus' }, // live value — the migration corrects this to 'operational'
  },
  {
    id: 29,
    name: ['Work', 'Scheduling'],
    rule: { type: 'regex', regex: 'calendar' },
    data: { class: 'operational' },
  },
  {
    id: 30,
    name: ['Work', 'Office Suite'],
    rule: {
      type: 'regex',
      regex: 'soffice|libreoffice-writer|libreoffice-calc|libreoffice-impress',
    },
    data: { class: 'operational' },
  },
  {
    id: 31,
    name: ['System Tools'],
    rule: {
      type: 'regex',
      regex: 'org\\.gnome\\.Nautilus|nautilus|nemo|thunar|xdg-desktop-portal-gnome|update-manager',
    },
  },
];
