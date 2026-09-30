/**
 * The site, as a reader navigates it: tabs, and the pages under each.
 *
 * This is the one registration a page needs. A `.md` page that is not listed
 * here fails the build, and so does an entry here with no page behind it, so
 * the navigation cannot fall behind the content or point at nothing.
 *
 * URLs stay flat — a page's URL is its slug, whichever tab it sits under — so
 * moving a page between tabs never breaks a link to it.
 */
export const TABS = [
  {
    id: 'start',
    label: 'Start',
    pages: [
      { slug: 'index', label: 'Overview' },
      { slug: 'quickstart', label: 'Quickstart' },
      { slug: 'system-requirements', label: 'System requirements' },
      { slug: 'build-your-first-harness', label: 'Build your first harness' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    pages: [
      { slug: 'services', label: 'Services' },
    ],
  },
  {
    id: 'abilities',
    label: 'Abilities',
    pages: [
      { slug: 'abilities', label: 'Abilities' },
    ],
  },
  {
    id: 'run',
    label: 'Run & ship',
    pages: [
      { slug: 'where-a-harness-runs', label: 'Where a harness runs' },
      { slug: 'ship', label: 'Ship a desktop app' },
    ],
  },
  {
    id: 'understand',
    label: 'Understand',
    pages: [
      { slug: 'thinking-in-lloyal', label: 'Thinking in Lloyal' },
      { slug: 'continuous-context', label: 'Continuous Context' },
      { slug: 'agent-policy-and-context-pressure', label: 'Adaptive compute' },
      { slug: 'focal-lens', label: 'Focus' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    pages: [
      { slug: 'harness-yml', label: 'harness.yml' },
      { slug: 'lookup', label: 'Lookup' },
    ],
  },
];

/**
 * Pages that are published but deliberately kept out of the navigation.
 * `licensing/publisher-tos` is linked from the publisher console's terms
 * checkbox, at `#publisher-terms-of-service`, and from nowhere a reader browses.
 */
export const HIDDEN = ['licensing/publisher-tos'];
