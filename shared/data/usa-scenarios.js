// Ready-made crises for the sandbox: each one sets off several incidents at once (see usa-incidents.js).
// A step is { kind, state } or { kind, crossing }.
export const SCENARIOS = {
  surge: { name: 'Border surge', desc: 'Migrant surges and a breach along the southern border.',
    steps: [{ kind: 'surge', crossing: 'bx-elpaso' }, { kind: 'surge', crossing: 'bx-laredo' }, { kind: 'breach', crossing: 'bx-nogales' }, { kind: 'protest', state: 'TX' }] },
  unrest: { name: 'Civil unrest', desc: 'Riots and protests in four big states, and a trucker blockade.',
    steps: [{ kind: 'riot', state: 'CA' }, { kind: 'riot', state: 'IL' }, { kind: 'protest', state: 'NY' }, { kind: 'protest', state: 'GA' }, { kind: 'trucker', state: 'PA' }] },
  invasion: { name: 'Northern incursion', desc: 'Foreign brigades cross from Canada at three crossings.',
    steps: [{ kind: 'incursion', crossing: 'bx-detroit' }, { kind: 'incursion', crossing: 'bx-buffalo' }, { kind: 'incursion', crossing: 'bx-blaine' }] },
  hurricane: { name: 'Gulf hurricane season', desc: 'A hurricane, floods and a chemical spill along the Gulf coast.',
    steps: [{ kind: 'hurricane', state: 'FL' }, { kind: 'hurricane', state: 'LA' }, { kind: 'flood', state: 'MS' }, { kind: 'chemical', state: 'TX' }] },
  militia: { name: 'Militia uprising', desc: 'Armed militias seize buildings in three states.',
    steps: [{ kind: 'uprising', state: 'MT' }, { kind: 'uprising', state: 'ID' }, { kind: 'uprising', state: 'OR' }] },
  quake: { name: 'West coast quake', desc: 'An earthquake and wildfires across California and Oregon.',
    steps: [{ kind: 'earthquake', state: 'CA' }, { kind: 'wildfire', state: 'CA' }, { kind: 'wildfire', state: 'OR' }] },
};
