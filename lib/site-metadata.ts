import type { Metadata } from 'next';

/** Canonical production origin. Preview deploys must not advertise other hosts. */
export const SITE_URL = 'https://acre-ops.netlify.app';
export const SITE_NAME = 'Acre Insights Operation Center';

export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Acre Insights Operation Center',
} as const;

export const PRIVATE_ROBOTS: Metadata['robots'] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false, noimageindex: true },
};

/**
 * Titles and descriptions for existing screens. Wording stays generic so
 * shared links and search snippets do not include customer or field names.
 */
export const PAGE_COPY = {
  dashboard: ['Dashboard', 'Season install progress, open repairs, and orders for signed-in staff.'],
  login: ['Sign in', 'Sign in to the Acre Insights Operation Center to open assigned field work.'],
  grower: ['Grower fields', 'Signed-in grower view of fields for one farm.'],
  growerLogin: ['Grower sign in', 'Sign in with your farm name and PIN to open grower fields.'],
  map: ['Map', 'Staff map of fields, probes, and open repairs.'],
  operations: ['Operations', 'Operations list for signed-in Acre Insights staff.'],
  growerActivity: ['Grower activity', 'Grower sign-ins and pages opened, for signed-in Acre Insights staff.'],
  orders: ['Orders', 'Supply orders and fulfillment for signed-in staff.'],
  install: ['Installs', 'Assigned probe installs for the current season.'],
  installer: ['Probe Installer', 'Crew sign-in for assigned Acre Insights probe installs.'],
  installerPulled: ['Installer pull tally', 'Crew tally of probes pulled today in the installer app.'],
  inventory: ['Supplies', 'Supply counts for signed-in Acre Insights staff.'],
  workflows: ['Workflows', 'Register, replace, and removal workflows for signed-in staff.'],
  crm: ['CRM', 'Operations, contacts, and billing accounts for signed-in staff.'],
  cropx: ['CropX orders', 'CropX order summary for signed-in staff.'],
  documents: ['Documents', 'Internal documents for signed-in Acre Insights staff.'],
  equipment: ['Equipment', 'Probe equipment list for signed-in staff.'],
  equipmentRacks: ['Equipment racks', 'Probe rack slots for signed-in staff.'],
  equipmentRegister: ['Register probe', 'Register a probe into inventory.'],
  equipmentReplace: ['Replace probe', 'Start a probe replacement for signed-in staff.'],
  equipmentSupplies: ['Equipment supplies', 'Equipment supply inventory for signed-in staff.'],
  equipmentWeather: ['Equipment weather stations', 'Weather station inventory in the equipment section.'],
  fieldInfo: ['Field information', 'Shared field sheet for someone who received this link.'],
  fields: ['Fields', 'Field list and season status for signed-in staff.'],
  route: ['Locations', 'Install locations for signed-in staff.'],
  seasonReadiness: ['Season readiness', 'Season readiness checklist for signed-in staff.'],
  settings: ['Settings', 'Workspace settings for signed-in Acre Insights staff.'],
  valleyPivots: ['Valley pivots', 'Valley pivot status for signed-in staff.'],
  waterRecs: ['Water recommendations', 'Water recommendations for signed-in staff.'],
  weatherStations: ['Weather stations', 'Weather station records for signed-in staff.'],
  approve: ['Probe approvals', 'Shared probe approval for someone who received this link.'],
  billing: ['Billing', 'Billing worksheet for signed-in staff.'],
  billingEntities: ['Billing accounts', 'Billing account list for signed-in staff.'],
  contacts: ['Contacts', 'Contact list for signed-in Acre Insights staff.'],
  probes: ['Probe inventory', 'Legacy probe inventory view for signed-in staff.'],
  pulled: ['Probes pulled today', 'Live count of probes pulled today for the crew tally.'],
  racks: ['Rack inventory', 'Legacy rack view for signed-in staff.'],
  repairs: ['Repairs', 'Open probe repairs for signed-in staff.'],
  review: ['Field review', 'Shared field review for someone who received this link.'],
  approvals: ['Approvals', 'Approval packets for signed-in staff.'],
  planting: ['Install planning', 'Install planning for the current season.'],
  notFound: ['Page not found', 'That address is not part of the Acre Insights Operation Center.'],
} as const;

export type PageKey = keyof typeof PAGE_COPY;

export function privateMetadata(title: string, description: string): Metadata {
  const fullTitle = `${title} · Acre Ops`;
  return {
    title,
    description,
    robots: PRIVATE_ROBOTS,
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export function staffMetadata(key: PageKey): Metadata {
  const [title, description] = PAGE_COPY[key];
  return privateMetadata(title, description);
}
