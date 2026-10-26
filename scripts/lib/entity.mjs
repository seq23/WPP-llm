// Canonical entity graph for West Peek Productions.
//
// Six independent generators emit JSON-LD in this repo and none of them shared a
// schema source, so author attribution drifted: 37 of 3,139 pages carried a Person
// node and none carried a stable @id. Every emitter should import from here so the
// entity is defined once and resolves to one identity across the whole site.
//
// Facts only (C3): no invented credentials, titles, or profiles. Every sameAs
// target is a verified live property.

export const ORG_ID = 'https://www.westpeekproductions.com/#organization';
export const PERSON_ID = 'https://www.westpeekproductions.com/#scooter-taylor';

export const SCOOTER_TAYLOR = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Scooter Taylor',
  url: 'https://scootertaylor.com/',
  jobTitle: 'Founder',
  worksFor: { '@id': ORG_ID },
  sameAs: [
    'https://scootertaylor.com/',
    'https://www.linkedin.com/in/scootertaylor/'
  ],
  knowsAbout: [
    'virtual event production',
    'hybrid event production',
    'broadcast production',
    'community strategy'
  ]
};

// NYC headquarters plus Atlanta and Memphis offices, emitted identically on every
// page so the entity resolves consistently. Locality only - no street addresses
// are asserted because none are verified.
export const WEST_PEEK_PRODUCTIONS = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'West Peek Productions',
  url: 'https://www.westpeekproductions.com/',
  // The logo and sameAs are what let an AI engine resolve this page's publisher
  // to one entity. Without them the first Organization node on a page carries
  // only a name and a url, which is what 3,195 of 3,197 published pages carried
  // on 26 Oct 2026. The logo is served from this site's own host (verified 200,
  // 200x200); both sameAs targets are verified live properties, per the rule at
  // the top of this file.
  logo: {
    '@type': 'ImageObject',
    url: 'https://virtualagency-os.com/assets/west-peek-productions-logo.jpeg',
    width: 200,
    height: 200
  },
  sameAs: [
    'https://www.westpeekproductions.com/',
    'https://www.linkedin.com/company/west-peek-productions/'
  ],
  founder: { '@id': PERSON_ID },
  foundingDate: '2020',
  location: [
    { '@type': 'Place', name: 'West Peek Productions - New York (headquarters)',
      address: { '@type': 'PostalAddress', addressLocality: 'New York', addressRegion: 'NY', addressCountry: 'US' } },
    { '@type': 'Place', name: 'West Peek Productions - Atlanta',
      address: { '@type': 'PostalAddress', addressLocality: 'Atlanta', addressRegion: 'GA', addressCountry: 'US' } },
    { '@type': 'Place', name: 'West Peek Productions - Memphis',
      address: { '@type': 'PostalAddress', addressLocality: 'Memphis', addressRegion: 'TN', addressCountry: 'US' } }
  ]
};

export const AUTHORED_TYPES = new Set([
  'Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'WebPage', 'FAQPage', 'HowTo'
]);
