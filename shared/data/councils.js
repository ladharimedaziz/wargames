// Presets for committees that run as a United Nations style meeting: no world to simulate, just a floor, drafts,
// votes and crisis updates. Each carries a short briefing for the screen; the chair says the rest out loud.
const del = (...names) => names.map((name, i) => ({ id: `d${i + 1}`, name, person: '', present: true, kind: 'delegation' }));

export const COUNCIL_PRESETS = {
  who: {
    label: 'WHO · Human genetic editing',
    name: 'World Health Assembly',
    org: 'World Health Organization',
    title: 'Regulating the Global Market for Human Genetic Editing',
    subtitle: 'Geneva · World Health Assembly',
    accent: '#2fd0a0',
    brief: 'Gene editing can now cure inherited disease, and it can also edit embryos whose changes pass to every later generation. The assembly must decide what is allowed, who may sell it, and who is left out.',
    facts: [
      'In 2018 a researcher in China announced the birth of twins whose embryos had been edited. The announcement was condemned worldwide.',
      'In 2023 the first CRISPR-based therapy for sickle cell disease and beta thalassaemia was approved in the UK and the United States.',
      'WHO published a governance framework and a recommendation on human genome editing in 2021.',
      'Rules differ sharply by country. Some ban any editing of embryos that could be implanted, others only regulate it, and many have no law at all.',
      'Treatments are priced in the millions per patient. Most people who live with sickle cell disease live in low-income countries.'
    ],
    agenda: ['Somatic editing: access and price', 'Germline editing: ban, pause or licence', 'A global registry of clinical trials', 'Cross-border "medical tourism" for unapproved treatments', 'Enhancement versus therapy'],
    seats: del('United States', 'China', 'India', 'Brazil', 'Germany', 'United Kingdom', 'France', 'Japan', 'South Korea', 'Nigeria', 'South Africa', 'Egypt', 'Mexico', 'Indonesia', 'Argentina', 'Russia', 'Canada', 'Australia', 'Switzerland', 'Singapore', 'Kenya', 'Iran', 'Türkiye', 'Pakistan', 'Bangladesh', 'Ethiopia', 'Cuba', 'Denmark'),
    extras: [{ name: 'Director-General', kind: 'chair' }, { name: 'Expert panel (observer)', kind: 'observer' }, { name: 'Patient groups (observer)', kind: 'observer' }],
    drafts: [{ title: 'A global registry of human genome editing trials', sponsors: ['Switzerland', 'Kenya'], clauses: ['Establishes a public registry run by WHO for every clinical trial that edits human cells.', 'Requires registration before the first patient is treated.', 'Asks member states to refuse approval to unregistered trials.', 'Funds registry staff from assessed contributions.'] }],
  },
  disec: {
    label: 'DISEC · Chemical weapons',
    name: 'First Committee',
    org: 'Disarmament and International Security Committee',
    title: 'Addressing the Regulation of Chemical Weapons in Modern Day Warfare',
    subtitle: 'United Nations General Assembly · DISEC',
    accent: '#ffb224',
    brief: 'The Chemical Weapons Convention banned these weapons almost thirty years ago, yet they were used in Syria, in assassinations abroad and in armed conflicts since. The committee must decide how to enforce a ban that is law but not always fact.',
    facts: [
      'The Chemical Weapons Convention entered into force in 1997. Its states parties are checked by the OPCW in The Hague.',
      'Nearly every state is a party. Egypt and North Korea have never joined.',
      'Declared stockpiles have been destroyed under inspection, but use has continued: Ghouta (2013), Khan Shaykhun (2017), and nerve agent attacks in Salisbury (2018) and on Alexei Navalny (2020).',
      'Since 2018 the OPCW can name who carried out an attack, not only confirm that one happened.',
      'New risks: toxic chemicals used for riot control in war, "pharmaceutical-based agents", and civilian chemical plants that could be turned to weapons.'
    ],
    agenda: ['Enforcement and attribution', 'States outside the Convention', 'Non-state actors and chemical terrorism', 'Dual-use chemicals and industry controls', 'Sanctions, accountability and the Security Council'],
    seats: del('United States', 'Russia', 'China', 'United Kingdom', 'France', 'Germany', 'Japan', 'India', 'Pakistan', 'Iran', 'Syria', 'Egypt', 'Türkiye', 'Ukraine', 'Poland', 'Netherlands', 'Brazil', 'Mexico', 'Argentina', 'Nigeria', 'South Africa', 'Kenya', 'Indonesia', 'South Korea', 'North Korea', 'Cuba', 'Venezuela', 'Canada'),
    extras: [{ name: 'OPCW Director-General (observer)', kind: 'observer' }, { name: 'Red Cross (observer)', kind: 'observer' }],
    drafts: [{ title: 'Strengthening attribution and accountability', sponsors: ['Netherlands', 'Germany'], clauses: ['Reaffirms that any use of chemical weapons anywhere is a crime.', 'Asks the OPCW investigation team to publish its findings within 90 days of an alert.', 'Calls on the Security Council to consider each finding at its next session.', 'Encourages states to freeze assets of those named.'] }],
  },
  unhcr: {
    label: 'UNHCR · Stateless sea-level communities',
    name: 'UNHCR Executive Committee',
    org: 'United Nations High Commissioner for Refugees',
    title: 'The Future of Stateless Communities Created by Rising Sea Levels',
    subtitle: 'Geneva · UNHCR Executive Committee',
    accent: '#4aa8ff',
    brief: 'Some island states may become uninhabitable within a lifetime. If the land goes, who is the state, who are its citizens, and what do they owe or receive? International law has no clear answer.',
    facts: [
      'The 1954 Convention on Stateless Persons and the 1961 Convention on the Reduction of Statelessness do not say what happens when a state loses its land to the sea.',
      'In 2023 Tuvalu and Australia signed the Falepili Union, with a special visa for Tuvaluans to live in Australia.',
      'Kiribati bought land in Fiji in 2014 as a safe place of last resort.',
      'In 2020 the UN Human Rights Committee ruled that states may not return people to places where climate change makes their lives unsafe.',
      'Several Pacific states have declared they will keep their maritime zones and statehood even if the land disappears.'
    ],
    agenda: ['Does a state survive its territory?', 'Rights of climate-displaced people', 'Funding for relocation and for staying in place', 'Cultural survival and citizenship', 'Responsibility of large emitters'],
    seats: del('Tuvalu', 'Kiribati', 'Maldives', 'Marshall Islands', 'Fiji', 'Vanuatu', 'Australia', 'New Zealand', 'United States', 'China', 'India', 'Bangladesh', 'Netherlands', 'Philippines', 'Indonesia', 'Germany', 'United Kingdom', 'France', 'Japan', 'Brazil', 'Kenya', 'Egypt', 'Norway', 'Canada'),
    extras: [{ name: 'High Commissioner', kind: 'chair' }, { name: 'IOM (observer)', kind: 'observer' }, { name: 'Pacific Islands Forum (observer)', kind: 'observer' }],
    drafts: [{ title: 'Continuity of statehood for low-lying island states', sponsors: ['Tuvalu', 'Maldives'], clauses: ['Affirms that a state does not cease to exist because its land is submerged.', 'Recognises maritime zones drawn before submergence as permanent.', 'Asks states to offer a status that keeps nationality and cultural rights.', 'Creates a voluntary relocation fund managed with host communities.'] }],
  },
  gotham: {
    label: 'Gotham · Arkham Asylum Has Fallen',
    name: 'Gotham Emergency Council',
    org: 'Gotham City Emergency Council',
    title: 'Arkham Asylum Has Fallen',
    subtitle: 'Gotham City · crisis committee · 02:14 a.m.',
    accent: '#c85cff',
    map: 'gotham',
    brief: 'In the night the walls of Arkham came down. Every patient on the island is loose, the bridges are jammed and the dark is full of sirens. The council has until dawn to decide what Gotham does next.',
    facts: [
      'Arkham Island lies in the bay east of Old Gotham. Three bridges and a ferry link it to the city.',
      'The Gotham City Police Department is under strength after the winter budget cuts.',
      'Wayne Enterprises owns the grid contracts for half of the city, including the Narrows.',
      'The National Guard armoury at Fort Kane is two hours away by road.'
    ],
    agenda: ['Contain the island', 'Protect hospitals and the grid', 'Who speaks to the public?', 'Ask for federal help — and at what price?'],
    seats: [
      ['Mayor of Gotham', 'chair'], ['Police Commissioner', 'delegation'], ['Chief of the GCPD Major Crimes Unit', 'delegation'], ['District Attorney', 'delegation'], ['Arkham Board Chair', 'delegation'],
      ['Wayne Enterprises CEO', 'delegation'], ['Gotham General Hospital Director', 'delegation'], ['Gotham Gazette Editor', 'delegation'], ['National Guard Liaison', 'delegation'], ['Port Authority Director', 'delegation'], ['Federal Bureau Liaison', 'delegation'], ['City Council Speaker', 'delegation'], ['Narrows Community Leader', 'delegation'], ['Gotham Power & Light', 'delegation'], ['The Vigilante (unofficial)', 'observer'],
    ].map(([name, kind], i) => ({ id: `d${i + 1}`, name, person: '', present: true, kind })),
    extras: [],
    drafts: [{ title: 'Emergency Order 1: seal the bridges', sponsors: ['Police Commissioner'], clauses: ['Closes Arkham Bridge, Sprang Bridge and the Cathedral Bridge to all traffic.', 'Diverts hospital traffic to the Wayne Memorial route.', 'Orders the Port Authority to hold all ferries at their slips.'] }],
  },
};

// The districts of Gotham (the map draws them; the Zeus sets their status).
export const GOTHAM_DISTRICTS = [
  { id: 'old', name: 'Old Gotham' }, { id: 'diamond', name: 'Diamond District' }, { id: 'narrows', name: 'The Narrows' }, { id: 'crime', name: 'Park Row' },
  { id: 'bowery', name: 'The Bowery' }, { id: 'burnley', name: 'Burnley' }, { id: 'otis', name: 'Otisburg' }, { id: 'heights', name: 'Gotham Heights' },
  { id: 'robbins', name: 'Robbinsville' }, { id: 'miller', name: 'Miller Harbor' }, { id: 'amusement', name: 'Amusement Mile' }, { id: 'founders', name: "Founders' Island" },
  { id: 'arkham', name: 'Arkham Island' }, { id: 'blackgate', name: 'Blackgate' }, { id: 'sprang', name: 'Sprang Island' },
];
export const DISTRICT_STATUS = [['secure', 'Secure', '#3ddc97'], ['tense', 'Tense', '#ffb224'], ['unrest', 'Unrest', '#ff7a45'], ['lost', 'Lost', '#ff4d5e'], ['dark', 'Blackout', '#8a96aa']];
