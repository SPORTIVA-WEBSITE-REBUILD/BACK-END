/**
 * Page blueprints: the contract between the public site's React pages and the
 * content administrators edit.
 *
 * Each blueprint lists, for one page slug, the sections the frontend renders
 * and which of a section's generic fields that page actually uses — with the
 * human label an administrator sees in the dashboard. The Page model stays
 * generic (heading, subheading, body, image, video, value, cta, items, labels);
 * the blueprint only names what each field MEANS on a given page.
 *
 * Why this lives in the backend (decision, CLAUDE.md Rule 10):
 *  - the dashboard builds its page forms from it (GET /api/pages/blueprints),
 *    so a field the site renders can never be missing from the editor;
 *  - the seed creates every section listed here, so content has somewhere to
 *    live before anyone opens the dashboard;
 *  - the public API fills any empty field from the blueprint's `default`, so
 *    the site never falls back to wording hardcoded in the frontend;
 *  - it stores no layout, styling or component names (Rule 7) — only which
 *    words, images and links a page has.
 *
 * Field spec: a string is the label; an object may add `hint`, `type`
 * ('text' | 'textarea' | 'rich') and `default`. A `cta` may set `labelOnly`
 * when the page decides where the button goes, and its `default` is
 * `{ label, href }`. `items` adds `singular`, `max` and the item `fields`
 * (title, text, icon, value, href, image). `labels` lists named strings under
 * `keys`, each `{ label, default, hint? }`.
 *
 * Defaults are the Colorlib template's own interface wording — button names,
 * placeholders, widget titles — so a fresh site reads exactly like the
 * template. Marketing copy (headings, paragraphs) has no default: that is the
 * firm's content.
 *
 * Keep in step with the page components in frontend/src/pages.
 */

const hero = (hint = 'The banner at the top of the page.') => ({
  key: 'hero',
  label: 'Page banner',
  hint,
  fields: {
    heading: 'Banner title',
    subheading: { label: 'Breadcrumb label', hint: 'Shown after "Home" in the breadcrumb trail. Defaults to the banner title.' },
    image: 'Banner background image',
  },
});

/**
 * Banner for a page that shows one record (a service, case, article, team
 * member or job). Its title is the record's own; the breadcrumb names the
 * listing it belongs to.
 */
const detailHero = (parent, hint) => ({
  key: 'hero',
  label: 'Banner',
  hint: hint || 'Used on every page of this kind; the title is the record\'s own.',
  fields: {
    image: 'Banner background image',
    labels: {
      label: 'Breadcrumb',
      keys: { parent: { label: 'Listing name in the breadcrumb', default: parent } },
    },
  },
});

const consultation = {
  key: 'consultation',
  label: 'Talk to a Lawyer panel',
  hint: 'A contact panel beside an enquiry form. Submissions arrive in Enquiries; the '
    + 'phone, email and address shown come from Settings, not from this form.',
  fields: {
    // Renders above the two-column layout as the section's own centred
    // heading (matching "Our Team"), not inside the left column — see
    // "Free consultation" in design-direction.md.
    subheading: { label: 'Section eyebrow', default: 'GET IN TOUCH' },
    heading: { label: 'Left column heading', default: 'Reliable Solutions for Your Legal Matters' },
    body: {
      label: 'Supporting copy',
      type: 'textarea',
      default: 'We follow a clear, step by step process to keep every client informed from '
        + 'first contact to resolution. Reach out and a member of our team will respond '
        + 'within one business day.',
    },
    // A short pull quote beside the contact details. Left with no default —
    // "our record speaks for itself" is not a line to put in the firm's
    // mouth before it has actually said it. Empty hides the block entirely.
    value: { label: 'Pull quote (optional)', type: 'textarea' },
    cta: { label: 'Submit button', labelOnly: true, default: { label: 'Send Message' } },
    labels: {
      label: 'Form text',
      keys: {
        sectionHeading: { label: 'Section heading', default: 'Contact Us' },
        name: { label: 'Name field caption', default: 'Name:' },
        namePlaceholder: { label: 'Name placeholder', default: 'Name' },
        email: { label: 'Email field caption', default: 'Email:' },
        emailPlaceholder: { label: 'Email placeholder', default: 'Email address' },
        phone: { label: 'Phone field caption', default: 'Phone:' },
        phonePlaceholder: { label: 'Phone placeholder', default: 'Phone number' },
        subject: { label: 'Subject field caption', default: 'Subject:' },
        subjectPlaceholder: { label: 'Subject placeholder', default: 'Subject' },
        message: { label: 'Message field caption', default: 'Message:' },
        messagePlaceholder: { label: 'Message placeholder', default: 'Tell Us Your Case' },
        sending: { label: 'While sending', default: 'Sending…' },
        success: { label: 'Sent message', default: 'Thank you for reaching out. A member of our legal team will contact you shortly.' },
        successHeading: { label: 'Sent message heading', default: 'Inquiry Submitted' },
        resetLabel: { label: 'Send another message button', default: 'Send another message' },
        error: { label: 'Failure message', default: 'We could not send your message. Please try again.' },
        rateLimited: { label: 'Too many messages', default: 'You have sent several messages already. Please try again later.' },
        callUs: { label: 'Phone row label', default: 'Call Us' },
        emailUs: { label: 'Email row label', default: 'Email Us' },
        headquarters: { label: 'Address row label', default: 'Headquarters' },
        availability: {
          label: 'Availability line',
          default: 'Available for consultations across our represented jurisdictions.',
        },
      },
    },
  },
};

const testimonials = {
  key: 'testimonials',
  label: 'Testimonials',
  hint: 'The quotes themselves are managed under Testimonials.',
  fields: {
    subheading: 'Small heading',
    heading: 'Heading',
  },
};

/** Sidebar widgets shared by the service and article pages. */
const widgets = {
  key: 'widgets',
  label: 'Sidebar widget titles',
  fields: {
    labels: {
      label: 'Widget text',
      keys: {
        searchPlaceholder: { label: 'Search box placeholder', default: 'Type a keyword and hit enter' },
        categoriesTitle: { label: 'Categories title', default: 'Categories' },
        recentBlogTitle: { label: 'Recent articles title', default: 'Recent Blog' },
        tagCloudTitle: { label: 'Tag cloud title', default: 'Tag Cloud' },
      },
    },
  },
};

export const PAGE_BLUEPRINTS = [
  {
    slug: 'layout',
    title: 'Site layout',
    sections: [
      {
        key: 'navCta',
        label: 'Menu button',
        hint: 'The highlighted button at the end of the main menu.',
        fields: {
          cta: { label: 'Button', default: { label: 'Talk to a Lawyer', href: '/contact' } },
          labels: {
            label: 'Menu text',
            keys: { menuToggle: { label: 'Mobile menu button', default: 'Menu' } },
          },
        },
      },
      {
        key: 'articlesPopup',
        label: 'Latest articles popup',
        hint: 'A prompt shown once per visit, a few seconds after the page loads, listing the two newest articles. Hidden on the Insights pages.',
        fields: {
          subheading: { label: 'Eyebrow label', default: 'LATEST INSIGHTS' },
          heading: { label: 'Heading', default: 'New from our lawyers' },
          cta: { label: 'Button', default: { label: 'View All Insights', href: '/insights' } },
          labels: {
            label: 'Popup text',
            keys: {
              readMore: { label: 'Article link', default: 'Read more' },
              close: { label: 'Close button (screen readers)', default: 'Close' },
            },
          },
        },
      },
      {
        key: 'newsletter',
        label: 'Newsletter band',
        hint: 'The sign-up strip above the footer on every page except Contact. Sign-ups arrive in Subscribers.',
        fields: {
          subheading: { label: 'Eyebrow label', default: 'STAY INFORMED' },
          heading: { label: 'Heading', default: 'Subscribe to our Newsletter' },
          labels: {
            label: 'Form text',
            keys: {
              emailLabel: { label: 'Email field caption', default: 'Email:' },
              placeholder: { label: 'Email placeholder', default: 'Email address' },
              submit: { label: 'Button', default: 'Subscribe' },
              success: { label: 'Signed-up message', default: 'Thank you for subscribing.' },
              error: { label: 'Failure message', default: 'Please enter a valid email address.' },
            },
          },
        },
      },
      {
        key: 'footer',
        label: 'Footer',
        fields: {
          body: { label: 'About text', type: 'textarea', hint: 'The short paragraph under the firm name.' },
          labels: {
            label: 'Footer text',
            keys: {
              servicesHeading: { label: 'Services column heading', default: 'Practice Areas' },
              contactHeading: { label: 'Contact column heading', default: 'Have a Questions?' },
              copyright: { label: 'Copyright line', default: 'Copyright ©{year} All rights reserved', hint: '{year} becomes the current year.' },
            },
          },
        },
      },
      {
        key: 'hours',
        label: 'Business hours',
        hint: 'The fourth footer column.',
        fields: {
          heading: { label: 'Heading', default: 'Business Hours' },
          items: {
            label: 'Groups',
            singular: 'Group',
            max: 6,
            fields: {
              title: 'Group title, e.g. Opening Days:',
              text: { label: 'Lines', type: 'textarea', hint: 'One line per row.' },
            },
          },
        },
      },
      {
        key: 'common',
        label: 'Shared interface text',
        hint: 'Words used across many pages.',
        fields: {
          labels: {
            label: 'Text',
            keys: {
              breadcrumbHome: { label: 'Breadcrumb "Home"', default: 'Home' },
              readMore: { label: 'Read more button', default: 'Read more' },
              minRead: { label: 'Reading time suffix', default: 'min read' },
              loading: { label: 'Loading', default: 'Loading' },
              errorTitle: { label: 'Error heading', default: 'We could not load this content' },
              errorText: { label: 'Error text', default: 'Please check your connection and try again.' },
              notFoundText: { label: 'Missing content text', default: 'The page you are looking for is not available.' },
              retry: { label: 'Retry button', default: 'Try again' },
              backHome: { label: 'Back home button', default: 'Back to home' },
              close: { label: 'Close (screen readers)', default: 'Close' },
              previous: { label: 'Previous (screen readers)', default: 'Previous' },
              next: { label: 'Next (screen readers)', default: 'Next' },
              of: { label: '"1 of 3" separator', default: 'of' },
              playVideo: { label: 'Play video (screen readers)', default: 'Play video' },
              viewProfile: { label: 'View profile link', default: 'View profile' },
            },
          },
        },
      },
      {
        key: 'caseTerms',
        label: 'Case record terms',
        hint: 'How party and outcome values are written wherever a case is shown.',
        fields: {
          labels: {
            label: 'Terms',
            keys: {
              partyAthlete: { label: 'Athlete', default: 'Athlete' },
              partyClub: { label: 'Club', default: 'Club' },
              partyFederation: { label: 'Federation', default: 'Federation' },
              partyAgent: { label: 'Agent', default: 'Agent' },
              partySponsor: { label: 'Sponsor', default: 'Sponsor' },
              partyOther: { label: 'Other', default: 'Other' },
              outcomeWon: { label: 'Won', default: 'Won' },
              outcomeSettled: { label: 'Settled', default: 'Settled' },
              outcomeDismissed: { label: 'Dismissed', default: 'Dismissed' },
              outcomeOngoing: { label: 'Ongoing', default: 'Ongoing' },
              outcomeWithdrawn: { label: 'Withdrawn', default: 'Withdrawn' },
            },
          },
        },
      },
      {
        key: 'jobTerms',
        label: 'Careers terms',
        fields: {
          labels: {
            label: 'Terms',
            keys: {
              fullTime: { label: 'Full time', default: 'Full time' },
              partTime: { label: 'Part time', default: 'Part time' },
              contract: { label: 'Contract', default: 'Contract' },
              internship: { label: 'Internship', default: 'Internship' },
              pupillage: { label: 'Pupillage', default: 'Pupillage' },
              nysc: { label: 'NYSC placement', default: 'NYSC placement' },
              onSite: { label: 'On site', default: 'On site' },
              hybrid: { label: 'Hybrid', default: 'Hybrid' },
              remote: { label: 'Remote', default: 'Remote' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'home',
    title: 'Home',
    sections: [
      {
        key: 'hero',
        label: 'Hero banner',
        hint: 'Banner at the top of the home page.',
        fields: {
          subheading: 'Small heading',
          heading: { label: 'Heading', hint: 'The rotating words are typed straight after this text.' },
          items: {
            label: 'Rotating words',
            singular: 'Word',
            max: 8,
            hint: 'Each word can have its own background, which fades in as the word appears. A slide may also carry its own small heading and paragraph; leave them blank to keep the hero\'s main ones.',
            fields: {
              title: 'Word or phrase',
              value: 'Small heading for this slide (optional)',
              text: 'Paragraph for this slide (optional)',
              image: 'Background for this word, e.g. a photograph',
            },
          },
          value: { label: 'Pause on each word (milliseconds)', default: '2000' },
          body: { label: 'Text', type: 'textarea' },
          image: 'Background image',
          cta: 'Button',
        },
      },
      {
        key: 'services',
        label: 'Services block',
        hint: 'The first three published services are shown as cards beside this text.',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
          cta: { label: 'Button', default: { label: 'All services', href: '/services' } },
        },
      },
      {
        key: 'intro',
        label: 'About block',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
          image: 'Image',
          video: { label: 'Video link', hint: 'A YouTube or Vimeo address. Leave empty to hide the play button.' },
          items: {
            label: 'Tabs',
            singular: 'Tab',
            max: 4,
            fields: { title: 'Tab name', text: { label: 'Tab text', type: 'textarea' } },
          },
        },
      },
      {
        key: 'experience',
        label: 'Years of experience badge',
        fields: {
          value: { label: 'Number', hint: 'Counts up when scrolled into view, e.g. 40' },
          heading: 'Caption',
        },
      },
      {
        key: 'record',
        label: 'Case studies block',
        hint: 'Published cases are shown in a carousel below this heading.',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
          cta: 'Button',
        },
      },
      {
        key: 'team',
        label: 'Attorneys block',
        hint: 'The first three published team members are shown as cards, with a button to the full team page.',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
          cta: { label: 'Button', default: { label: 'View Our Full Team', href: '/lawyers' } },
        },
      },
      {
        key: 'careers',
        label: 'Open roles strip',
        hint: 'Shown only while at least one job is open. Roles are managed under Careers.',
        fields: {
          subheading: { label: 'Small heading', default: 'Careers' },
          heading: { label: 'Heading', default: "We're hiring" },
          cta: { label: 'Button', default: { label: 'View all roles', href: '/careers' } },
          labels: {
            label: 'Role text',
            keys: {
              viewRole: { label: 'View role button', default: 'View role' },
              closes: { label: 'Closing date prefix', default: 'Closes' },
            },
          },
        },
      },
      consultation,
      testimonials,
      {
        key: 'gallery',
        label: 'Gallery block',
        hint: 'Leave the heading empty to hide the gallery on the home page.',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
        },
      },
      {
        key: 'insights',
        label: 'Blog block',
        hint: 'The three most recent articles are shown below this heading, with a button to the full Insights page.',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
          cta: { label: 'Button', default: { label: 'View All Insights', href: '/insights' } },
        },
      },
    ],
  },
  {
    slug: 'about',
    title: 'About',
    sections: [
      hero(),
      {
        key: 'intro',
        label: 'Opening paragraph',
        hint: 'The lead paragraph at the top of the About page.',
        fields: {
          subheading: 'Small heading',
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
        },
      },
      {
        key: 'sections',
        label: 'Topics',
        hint: 'One block per topic, in order: a heading with its paragraph beside it.',
        fields: {
          items: {
            label: 'Topics',
            singular: 'Topic',
            max: 12,
            fields: { title: 'Heading', text: { label: 'Paragraph', type: 'textarea' } },
          },
        },
      },
      consultation,
    ],
  },
  {
    slug: 'lawyers',
    title: 'Attorneys',
    sections: [
      hero(),
    ],
  },
  {
    slug: 'lawyer-detail',
    title: 'Team member page',
    sections: [
      detailHero('Attorneys'),
      {
        key: 'contact',
        label: 'Contact box',
        hint: 'Used on every team member\'s profile page.',
        fields: { heading: { label: 'Heading', default: 'Contact' } },
      },
      {
        key: 'qualifications',
        label: 'Qualifications',
        fields: { heading: { label: 'Heading', default: 'Qualifications' } },
      },
      {
        key: 'practiceAreas',
        label: 'Practice areas',
        fields: { heading: { label: 'Heading', default: 'Practice areas' } },
      },
      {
        key: 'insights',
        label: 'Recent insights',
        hint: 'Articles this team member wrote are previewed at the foot of the profile.',
        fields: { heading: { label: 'Heading', default: 'Recent insights' } },
      },
    ],
  },
  {
    slug: 'services',
    title: 'Services',
    sections: [
      hero(),
    ],
  },
  {
    slug: 'service-detail',
    title: 'Service page',
    sections: [
      detailHero('Practice Areas'),
      {
        key: 'overview',
        label: 'Overview heading',
        hint: 'Used on every individual service page.',
        fields: { heading: { label: 'Heading', default: 'Overview:' } },
      },
      {
        key: 'help',
        label: 'How can we help',
        fields: {
          heading: { label: 'Heading', default: 'How Can We Help !' },
          body: { label: 'Text', type: 'textarea' },
          cta: { label: 'Button', default: { label: 'Talk to a Lawyer', href: '/contact' } },
        },
      },
      {
        key: 'advisors',
        label: 'Legal advisors',
        hint: 'Team members linked to the service are shown below this heading.',
        fields: { heading: { label: 'Heading', default: 'Our Legal Advisors' } },
      },
      {
        key: 'relatedCases',
        label: 'Related matters',
        hint: 'Cases linked to the service are previewed below the advisors.',
        fields: { heading: { label: 'Heading', default: 'Related matters' } },
      },
      {
        key: 'sidebar',
        label: 'Sidebar text box',
        hint: 'The last box in the sidebar of every service page.',
        fields: {
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
        },
      },
      widgets,
    ],
  },
  {
    slug: 'record',
    title: 'Case Record',
    sections: [
      hero(),
      {
        key: 'filters',
        label: 'Filter bar',
        hint: 'Shown when case filters are switched on in Settings.',
        fields: {
          labels: {
            label: 'Filter text',
            keys: {
              forum: { label: 'Forum label', default: 'Forum' },
              allForums: { label: 'All forums option', default: 'All forums' },
              year: { label: 'Year label', default: 'Year' },
              allYears: { label: 'All years option', default: 'All years' },
              party: { label: 'Party label', default: 'Party represented' },
              anyParty: { label: 'Any party option', default: 'Any party' },
              search: { label: 'Search label', default: 'Search' },
              searchPlaceholder: { label: 'Search placeholder', default: 'Search the record' },
              clearAll: { label: 'Clear all button', default: 'Clear all' },
              resultOne: { label: 'Result count, one', default: 'matter' },
              resultMany: { label: 'Result count, many', default: 'matters' },
              emptyTitle: { label: 'No results heading', default: 'No matters match those filters' },
              emptyText: { label: 'No results text', default: 'Try widening your search, or clear the filters to see the full record.' },
              clearFilters: { label: 'Clear filters button', default: 'Clear filters' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'case-detail',
    title: 'Case page',
    sections: [
      detailHero('Case Studies'),
      {
        key: 'overview',
        label: 'Overview',
        hint: 'Used on every individual case page.',
        fields: {
          heading: { label: 'Heading', default: 'Overview' },
          body: { label: 'Anonymised case notice', type: 'textarea', hint: 'Shown on cases marked as anonymised.' },
        },
      },
      {
        key: 'details',
        label: 'Matter details box',
        fields: {
          heading: { label: 'Heading', default: 'Matter details' },
          labels: {
            label: 'Detail names',
            keys: {
              forum: { label: 'Forum', default: 'Forum:' },
              year: { label: 'Year', default: 'Year:' },
              represented: { label: 'Party represented', default: 'Represented:' },
              outcome: { label: 'Outcome', default: 'Outcome:' },
              practiceArea: { label: 'Practice area', default: 'Practice area:' },
            },
          },
        },
      },
      {
        key: 'sidebar',
        label: 'Sidebar call to action',
        fields: {
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
          cta: { label: 'Button', default: { label: 'Talk to a Lawyer', href: '/contact' } },
        },
      },
    ],
  },
  {
    slug: 'insights',
    title: 'Insights',
    sections: [
      hero(),
      {
        key: 'list',
        label: 'Article list',
        fields: {
          labels: {
            label: 'List text',
            keys: {
              emptyTitle: { label: 'No articles heading', default: 'No articles yet' },
              emptyText: { label: 'No articles text', default: 'Nothing has been published yet. Please check back soon.' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'article-detail',
    title: 'Article page',
    sections: [
      detailHero('Blog'),
      {
        key: 'sidebar',
        label: 'Sidebar text box',
        hint: 'The last box in the sidebar of every article.',
        fields: {
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
        },
      },
      widgets,
      {
        key: 'comments',
        label: 'Comments',
        hint: 'New comments wait under Comments until they are approved.',
        fields: {
          labels: {
            label: 'Comment text',
            keys: {
              countOne: { label: 'Count heading, one', default: 'Comment' },
              countMany: { label: 'Count heading, many', default: 'Comments' },
              reply: { label: 'Reply link', default: 'Reply' },
              replyingTo: { label: 'Replying to', default: 'Replying to' },
              cancelReply: { label: 'Cancel reply', default: 'Cancel' },
              formHeading: { label: 'Form heading', default: 'Leave a comment' },
              name: { label: 'Name field', default: 'Name *' },
              email: { label: 'Email field', default: 'Email *' },
              website: { label: 'Website field', default: 'Website' },
              message: { label: 'Message field', default: 'Message' },
              submit: { label: 'Submit button', default: 'Post Comment' },
              sending: { label: 'While sending', default: 'Posting…' },
              success: { label: 'Awaiting approval message', default: 'Thank you — your comment will appear once it has been approved.' },
              error: { label: 'Failure message', default: 'We could not post your comment. Please try again.' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'careers',
    title: 'Careers',
    sections: [
      hero(),
      {
        key: 'intro',
        label: 'Introduction',
        fields: {
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
        },
      },
      {
        key: 'speculative',
        label: 'Speculative applications',
        hint: 'Shown when there are no open roles.',
        fields: {
          heading: { label: 'Heading', default: 'No open positions at the moment' },
          body: { label: 'Text', type: 'textarea' },
          cta: { label: 'Button', labelOnly: true, hint: 'The button emails the careers address in Settings.', default: { label: 'Send a speculative application' } },
        },
      },
      {
        key: 'list',
        label: 'Role cards',
        fields: {
          labels: {
            label: 'Card text',
            keys: {
              closes: { label: 'Closing date prefix', default: 'Closes' },
              viewRole: { label: 'View button', default: 'View role' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'vacancy-detail',
    title: 'Job page',
    sections: [
      detailHero('Careers', 'Used on every job page; the title is the job title.'),
      {
        key: 'apply',
        label: 'How to apply',
        fields: {
          heading: { label: 'Heading', default: 'Apply' },
          body: { label: 'Text', type: 'textarea' },
          cta: { label: 'Apply button', labelOnly: true, hint: 'The link comes from each job.', default: { label: 'Apply for this role' } },
        },
      },
      {
        key: 'closed',
        label: 'Closed role notice',
        fields: { body: { label: 'Text', type: 'textarea', default: 'Applications for this position have closed.' } },
      },
      {
        key: 'details',
        label: 'Role details',
        fields: {
          labels: {
            label: 'Detail names',
            keys: {
              glance: { label: 'Summary box heading', default: 'At a glance' },
              location: { label: 'Location', default: 'Location:' },
              type: { label: 'Employment type', default: 'Type:' },
              arrangement: { label: 'Working arrangement', default: 'Arrangement:' },
              team: { label: 'Team', default: 'Team:' },
              salary: { label: 'Salary', default: 'Salary:' },
              closes: { label: 'Closing date', default: 'Closes:' },
              responsibilities: { label: 'Responsibilities heading', default: 'What you will do' },
              requirements: { label: 'Requirements heading', default: 'What we are looking for' },
              otherOpenings: { label: 'Other roles heading', default: 'Other openings' },
              viewAll: { label: 'All roles button', default: 'View all roles' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact',
    sections: [
      hero(),
      {
        key: 'intro',
        label: 'Contact information',
        hint: 'Address, phone, email and website come from Settings.',
        fields: {
          heading: { label: 'Heading', default: 'Contact Information' },
          body: { label: 'Text', type: 'textarea' },
          labels: {
            label: 'Field names',
            keys: {
              address: { label: 'Address', default: 'Address:' },
              phone: { label: 'Phone', default: 'Phone:' },
              email: { label: 'Email', default: 'Email:' },
              website: { label: 'Website', default: 'Website' },
            },
          },
        },
      },
      {
        key: 'form',
        label: 'Contact form',
        hint: 'The two-panel card: your words and the firm\'s contact details on the left, the enquiry form on the right. Phone, email and address come from Settings.',
        fields: {
          heading: { label: 'Left panel heading', default: 'Reliable Solutions for Your Legal Matters' },
          value: { label: 'Pull quote (optional)', type: 'textarea' },
          cta: { label: 'Submit button', labelOnly: true, default: { label: 'Send Message' } },
          body: { label: 'Notice below the form', type: 'textarea' },
          labels: {
            label: 'Form text',
            keys: {
              name: { label: 'Name field caption', default: 'Name:' },
              namePlaceholder: { label: 'Name placeholder', default: 'Name' },
              email: { label: 'Email field caption', default: 'Email:' },
              emailPlaceholder: { label: 'Email placeholder', default: 'Email address' },
              phone: { label: 'Phone field caption', default: 'Phone:' },
              phonePlaceholder: { label: 'Phone placeholder', default: 'Phone number' },
              subject: { label: 'Subject field caption', default: 'Subject:' },
              subjectPlaceholder: { label: 'Subject placeholder', default: 'Subject' },
              message: { label: 'Message field caption', default: 'Message:' },
              messagePlaceholder: { label: 'Message placeholder', default: 'Tell Us Your Case' },
              sending: { label: 'While sending', default: 'Sending…' },
              success: { label: 'Sent message', default: 'Thank you for reaching out. A member of our legal team will contact you shortly.' },
              successHeading: { label: 'Sent message heading', default: 'Inquiry Submitted' },
              resetLabel: { label: 'Send another message button', default: 'Send another message' },
              error: { label: 'Failure message', default: 'We could not send your message. Please try again.' },
              rateLimited: { label: 'Too many messages', default: 'You have sent several messages already. Please try again later.' },
              callUs: { label: 'Phone row label', default: 'Call Us' },
              emailUs: { label: 'Email row label', default: 'Email Us' },
              headquarters: { label: 'Address row label', default: 'Headquarters' },
              availability: { label: 'Availability line', default: 'Available for consultations across our represented jurisdictions.' },
            },
          },
        },
      },
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    sections: [
      hero(),
      {
        key: 'body',
        label: 'Page content',
        fields: { body: { label: 'Content', type: 'rich' } },
      },
    ],
  },
  {
    slug: 'not-found',
    title: 'Page not found',
    sections: [
      hero('The banner shown when a page does not exist.'),
      {
        key: 'body',
        label: 'Message',
        fields: {
          heading: 'Heading',
          body: { label: 'Text', type: 'textarea' },
          items: {
            label: 'Suggested links',
            singular: 'Link',
            max: 6,
            fields: { title: 'Label', href: 'Link' },
          },
        },
      },
    ],
  },
];

export const blueprintFor = (slug) => PAGE_BLUEPRINTS.find((b) => b.slug === slug);

const TEXT_FIELDS = ['heading', 'subheading', 'body', 'value', 'video'];
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Fills a stored page with its blueprint's defaults.
 *
 * Every section the blueprint lists is present in the result, even if it was
 * never saved, and every empty field that has a default gets it. A field an
 * administrator has written is never touched. Sections the blueprint does not
 * know about pass through unchanged.
 *
 * Works on a plain object (lean query) and returns a new one.
 */
export function withDefaults(slug, page) {
  const blueprint = blueprintFor(slug);
  if (!blueprint) return page;

  const stored = new Map((page?.sections || []).map((s) => [s.key, s]));
  const known = new Set(blueprint.sections.map((s) => s.key));

  const sections = blueprint.sections.map((b) => {
    const section = { key: b.key, ...(stored.get(b.key) || {}) };

    for (const field of TEXT_FIELDS) {
      const spec = b.fields[field];
      if (spec && typeof spec === 'object' && spec.default !== undefined && isEmpty(section[field])) {
        section[field] = spec.default;
      }
    }

    const ctaDefault = b.fields.cta?.default;
    if (ctaDefault) {
      section.cta = {
        label: isEmpty(section.cta?.label) ? ctaDefault.label || '' : section.cta.label,
        href: isEmpty(section.cta?.href) ? ctaDefault.href || '' : section.cta.href,
      };
    }

    const keys = b.fields.labels?.keys;
    if (keys) {
      const saved = section.labels instanceof Map
        ? Object.fromEntries(section.labels)
        : (section.labels || {});
      const merged = {};
      for (const [name, spec] of Object.entries(keys)) {
        merged[name] = isEmpty(saved[name]) ? spec.default ?? '' : saved[name];
      }
      section.labels = merged;
    }

    return section;
  });

  const extra = (page?.sections || []).filter((s) => !known.has(s.key));

  return {
    ...(page || {}),
    slug,
    title: page?.title || blueprint.title,
    sections: [...sections, ...extra],
  };
}
