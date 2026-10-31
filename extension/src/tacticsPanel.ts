/**
 * The tactics tab: what to try when a fight is going badly.
 *
 * The shape — a problem, then the manoeuvres that answer it — is borrowed from
 * the *Unofficial Combat Survival Guide* (v.5, by u/anri11, Silent Mask), a
 * one-page sheet for Savage Worlds Adventure Edition that Paul's table uses.
 * The **words are not**: every row was rewritten from the Deadlands rulebook and
 * cites its page there. The guide's page numbers are the SWADE core book's, and
 * in a handful of places this book says something different:
 *
 * - **Cover in melee.** The guide says Fighting hits a foe in cover with no
 *   penalty. p154 applies cover to *"melee and ranged attacks"*.
 *   Closing to melee does still get round a Prone target's −4 (p160).
 * - **Entangled** is Vulnerable here, not Distracted (p153).
 * - **Stunned** gives no Drop. A successful recovery leaves you Vulnerable to the
 *   end of your next turn and a raise clears it; Stunned characters don't count
 *   toward Gang Up (p162).
 * - **Shooting in melee** is a pistol at most, against Parry, not TN 4 (p160).
 * - **Push** gets +2 for having *run* 2″ first, not just moved (p160).
 * - **Ready** is two *items* a turn (p161), and a Support Critical Failure is −2
 *   to the ally (p162). Neither is on the guide.
 * - **Aim** also covers Scale and Speed penalties and must be spent on the first
 *   action (p152); at Extreme Range it does nothing (p146), which the shot panel
 *   enforces.
 * - The guide's 2″-to-crawl-1″ is not in this book, so it is left out.
 *
 * Paraphrased rather than quoted: the rulebook's text is not ours to publish.
 *
 * Static by design. Nothing here reads a token, a sheet or the room, so a tab
 * every player sees cannot tell them anything about what is on the map.
 */

/** Who a manoeuvre is good for — the guide's "Helps" column. */
type Helps = 'You' | 'Ally' | 'Team';

interface Tactic {
  name: string;
  /** When it fits: the guide's "And…" column. */
  when: string;
  effect: string;
  /** Deadlands core pages, as `p154` or `p160–161`. */
  page: string;
  helps: Helps;
  /** Where to find it in this extension, or what to do by hand when it isn't here. */
  app?: string;
}

interface Problem {
  title: string;
  tactics: readonly Tactic[];
}

const WILD_ATTACK: Tactic = {
  name: 'Wild Attack',
  when: 'You can afford to drop your guard',
  effect: '+2 to Fighting and to the damage that follows. You are Vulnerable until the end of your next turn.',
  page: 'p165',
  helps: 'You',
  app: 'Fighting panel → Conditions ▾ → Swing: Wild. The app marks you Vulnerable when you roll.',
};

export const PROBLEMS: readonly Problem[] = [
  {
    title: 'You can’t hit them — they parry everything',
    tactics: [
      {
        name: 'Gang Up',
        when: 'Your side outnumbers them',
        effect:
          '+1 Fighting for each other adjacent attacker who isn’t Stunned, up to +4. Each of their allies adjacent to both of you cancels a point.',
        page: 'p157',
        helps: 'Team',
        app: 'Fighting panel → Conditions ▾ → Gang Up.',
      },
      {
        name: 'Push them over',
        when: 'You’re strong, have a shield, or can run at them',
        effect:
          'Opposed Strength (either side may use Athletics instead), adding any shield’s Parry bonus; +2 if you ran 2″ first. Success pushes them 1″, a raise 2″. They roll Athletics (−2 if you raised) or fall Prone — and a Prone foe has −2 Parry in melee.',
        page: 'p160',
        helps: 'Team',
        app: 'Not automated: roll Strength or Athletics, and the Marshal marks them Prone.',
      },
      WILD_ATTACK,
      {
        name: 'Desperate Attack',
        when: 'Hitting matters more than hurting',
        effect: '+2 or +4 to Fighting, and the same off the damage if you hit. Not with a Wild Attack.',
        page: 'p155',
        helps: 'You',
        app: 'Fighting panel → Conditions ▾ → Swing: Desperate.',
      },
      {
        name: 'Back off and shoot',
        when: 'You have a gun and can get clear',
        effect:
          'At range the target number is 4, not their Parry. Still in melee you may fire only a pistol or smaller, against Parry, and shooting anyone not adjacent makes you Vulnerable. Leaving melee gives free attacks (see Withdraw). Drawing and holstering: two items a turn are free.',
        page: 'p160–161, p165',
        helps: 'You',
      },
    ],
  },
  {
    title: 'You can’t hit them — the penalties are too steep',
    tactics: [
      {
        name: 'Aim',
        when: 'You can spend a whole turn doing nothing else',
        effect:
          'On your next turn’s first action, ignore up to 4 points of Range, Cover, Called Shot, Scale or Speed penalties — or take +2. No help at all at Extreme Range.',
        page: 'p152, p146',
        helps: 'You',
        app: 'Shot panel → Conditions ▾ → Aim.',
      },
      {
        name: 'Close to melee',
        when: 'You’re shooting and can reach them',
        effect:
          'No range penalties up close, and a Prone foe loses its −4 against shots: in melee it has −2 Parry instead. Cover still counts in melee.',
        page: 'p154, p160',
        helps: 'You',
      },
    ],
  },
  {
    title: 'Either way — help, or hinder',
    tactics: [
      {
        name: 'Support an ally',
        when: 'You can say how you’re helping',
        effect:
          'Roll a fitting skill: success is +1 to one of their Traits this round, a raise +2, up to +4 from everyone. A Critical Failure is −2 to them. It lapses at the end of their turn.',
        page: 'p162',
        helps: 'Ally',
        app: 'Not tracked: your ally dials it in by hand.',
      },
      {
        name: 'Test them',
        when: 'You have a trick — sand in the eyes, a feint, a taunt, a glare',
        effect:
          'Describe it and roll the skill against the attribute it’s linked to (Fighting and Athletics against Agility, Taunt against Smarts). Win and they’re Distracted or Vulnerable, your choice; with a raise they’re also Shaken. Repeating the same trick soon stops working.',
        page: 'p164',
        helps: 'Team',
        app: 'The Marshal marks the result on their token.',
      },
      {
        name: 'Grapple',
        when: 'You’d rather hold them than hurt them',
        effect:
          'Opposed Athletics. Win and they’re Entangled; a raise, or a win on someone already Entangled, and they’re Bound — but you’re Vulnerable while you hold them Bound. Gang Up counts.',
        page: 'p157, p153',
        helps: 'Team',
      },
    ],
  },
  {
    title: 'You hit, but they shrug it off',
    tactics: [
      {
        name: 'Called Shot',
        when: 'You can hit them, just not hard enough',
        effect:
          'Limb −2. Hand −4, and they may drop what’s in it. Head or vitals −4 for +4 damage. A gap in their armour: a penalty for its size, and the damage ignores the Armor.',
        page: 'p154–155',
        helps: 'You',
        app: 'Fighting or shot panel → Conditions ▾ → Called.',
      },
      WILD_ATTACK,
      {
        name: 'Go for the raise',
        when: 'Always',
        effect:
          'A raise on the attack adds +1d6 damage, and that die can Ace. Anything that helps you hit — Gang Up, Aim, a Test — helps you raise.',
        page: 'p148',
        helps: 'You',
      },
    ],
  },
  {
    title: 'You’re going down if you stay here',
    tactics: [
      {
        name: 'Defend',
        when: 'They’re on you and help is coming',
        effect:
          'Spend the whole turn on it, no Multi-Actions: +4 Parry until your next turn starts. You can move, but not run.',
        page: 'p154',
        helps: 'You',
        app: 'Not tracked: tell the Marshal.',
      },
      {
        name: 'Withdraw',
        when: 'You’d rather not roll at all',
        effect:
          'Every adjacent foe who isn’t Shaken or Stunned gets a free attack as you leave. Defend first and then back away, and those attacks are against Parry +4.',
        page: 'p165, p156',
        helps: 'You',
      },
      {
        name: 'Push, then move',
        when: 'Only one of them is on you',
        effect: 'A successful Push leaves them out of reach, so walking away draws no free attack.',
        page: 'p160',
        helps: 'Team',
      },
      {
        name: 'Test, then move',
        when: 'Only one of them is on you, and you have a trick',
        effect:
          'Win with a raise and they’re Shaken, and a Shaken foe gets no free attack when you leave. A plain win leaves them Distracted or Vulnerable.',
        page: 'p164, p165',
        helps: 'Team',
      },
      {
        name: 'Find cover, or drop Prone',
        when: 'They’re shooting at you from a distance',
        effect:
          'Cover is −2, −4, −6 or −8 to their shots, by how much of you it hides. Prone counts as −4 against shots from 3″ or more (not on top of cover) and −4 from area damage — but in melee you’re at −2 Parry and −2 Fighting, and standing costs 2″.',
        page: 'p154, p160',
        helps: 'You',
        app: 'Prone: your sheet → Conditions ▾. Cover is set by the shooter, per target.',
      },
    ],
  },
];

/** The two things everybody needs mid-fight, whatever else is going on. */
export const ALWAYS: readonly Tactic[] = [
  {
    name: 'Shake it off',
    when: 'You’re Shaken',
    effect: 'Roll Spirit as a free action at the start of your turn, or spend a Benny at any time.',
    page: 'p148',
    helps: 'You',
  },
  {
    name: 'Soak',
    when: 'You’re about to take Wounds',
    effect:
      'Spend a Benny and roll Vigor: each success and raise is one Wound fewer. Soak them all and any Shaken goes too. Once per attack, but more Bennies reroll it and you keep the best.',
    page: 'p150',
    helps: 'You',
  },
];

/** The conditions the tips above keep naming. */
export const CONDITIONS: readonly { name: string; text: string; page: string }[] = [
  { name: 'Shaken', text: 'Free actions only, which includes moving and running.', page: 'p148' },
  { name: 'Distracted', text: '−2 to all Trait rolls until the end of your next turn.', page: 'p155' },
  { name: 'Vulnerable', text: '+2 to actions and attacks against you until the end of your next turn. Not on top of The Drop.', page: 'p155' },
  { name: 'Entangled', text: 'Can’t move, and Vulnerable. Break free as an action: Athletics, or Strength −2.', page: 'p153' },
  {
    name: 'Bound',
    text: 'Can’t move or act physically except to break free; Distracted and Vulnerable. Breaking free: success makes you Entangled, a raise frees you.',
    page: 'p153',
  },
  {
    name: 'Stunned',
    text: 'Distracted, Vulnerable and Prone; can’t move or act; no help to a Gang Up. Roll Vigor at the start of your turn: success ends it but leaves you Vulnerable to the end of your next turn, a raise clears that too.',
    page: 'p162',
  },
  {
    name: 'Prone',
    text: '−4 to be shot from 3″ or more (not on top of cover), −4 from area damage; −2 Parry and −2 Fighting in melee. Standing costs 2″.',
    page: 'p160',
  },
  {
    name: 'The Drop',
    text: '+4 to attack and damage for one action. Shaken or worse from it means a Vigor roll (−2 to the head) or out cold.',
    page: 'p155–156',
  },
];

function tacticRow(tactic: Tactic): HTMLElement {
  const row = document.createElement('details');
  row.className = 'tactic';
  const summary = document.createElement('summary');
  const name = document.createElement('b');
  name.textContent = tactic.name;
  const when = document.createElement('span');
  when.className = 'tactic-when';
  when.textContent = tactic.when;
  const helps = document.createElement('span');
  helps.className = `tactic-helps ${tactic.helps.toLowerCase()}`;
  helps.textContent = tactic.helps;
  helps.title =
    tactic.helps === 'You' ? 'Helps you' : tactic.helps === 'Ally' ? 'Helps one ally' : 'Helps the whole side';
  summary.append(name, helps, when);
  row.append(summary);

  const effect = document.createElement('p');
  effect.textContent = tactic.effect;
  const page = document.createElement('span');
  page.className = 'tactic-page';
  page.textContent = ` ${tactic.page}`;
  effect.append(page);
  row.append(effect);
  if (tactic.app) {
    const app = document.createElement('p');
    app.className = 'tactic-app';
    app.textContent = tactic.app;
    row.append(app);
  }
  return row;
}

function heading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

/**
 * Built once and handed back each time.
 *
 * The sheet area is repainted on every token move and every roll, and a pane
 * rebuilt from scratch closes whichever row the reader had open, mid-sentence.
 * Nothing in it changes, so the same node goes back in and keeps its state.
 */
let built: HTMLElement | undefined;

export function renderTactics(): HTMLElement {
  if (built) return built;
  const out = document.createElement('div');
  out.className = 'tactics';

  const intro = document.createElement('p');
  intro.className = 'tactics-intro';
  intro.textContent = 'Stuck in a fight? Find your problem, then tap a manoeuvre to see what it does.';
  out.append(intro);

  for (const problem of PROBLEMS) {
    out.append(heading(problem.title));
    for (const tactic of problem.tactics) out.append(tacticRow(tactic));
  }

  out.append(heading('Every fight'));
  for (const tactic of ALWAYS) out.append(tacticRow(tactic));

  out.append(heading('Conditions'));
  const list = document.createElement('dl');
  list.className = 'tactic-conditions';
  for (const condition of CONDITIONS) {
    const term = document.createElement('dt');
    term.textContent = condition.name;
    const text = document.createElement('dd');
    text.textContent = `${condition.text} `;
    const page = document.createElement('span');
    page.className = 'tactic-page';
    page.textContent = condition.page;
    text.append(page);
    list.append(term, text);
  }
  out.append(list);

  const credit = document.createElement('p');
  credit.className = 'tactics-credit';
  credit.textContent =
    'Layout after the Unofficial Combat Survival Guide by u/anri11 (Silent Mask). Rules and pages from Deadlands: The Weird West.';
  out.append(credit);

  built = out;
  return out;
}
