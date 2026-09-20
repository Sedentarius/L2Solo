# Class gameplay policy

`BotClassPolicy` is the initial shared runtime layer for all 89 C4 class stages.
It reads the existing skill tree once, indexes inherited skill unlocks, and uses
the existing class equipment profiles. It does not read research files or call
an LLM. SA is intentionally deferred.

## Implemented consumers

- `LevelingRoutes`: the Might of Heaven route requires skill 1028. Live skillbooks
  override theoretical training; population records use class, level and ancestry.
  A missing skill removes the route preference, not access to every undead mob.
- `BotCombatUtility`: solo/party PvE/PvP mana budgets, drain preference when HP is
  missing, and decision reasons. Available charged attacks determine preparation;
  attacks on cooldown do not cause charge preparation. Weapon, HP, MP, reuse and
  target restrictions remain gates before class and personal scoring hints.
  Preparation now names a concrete spender, respects the learned charge cap,
  budgets all remaining charge casts plus the attack, and competes with attacks
  already usable now. Every tick re-evaluates the current target and restrictions.
  The dispatch record includes the intended skill and remaining charge casts.
  Dead targets do not restart attacks or preparation.
  Rear-only blows require the native rear-position check. Cold actors have no
  heading model and conservatively choose another attack instead of assuming a
  successful Backstab. Decisions expose intent, resource cost and up to eight
  rejected alternatives.
- `BotActionFeedback` receives native cast acceptance, rejection and actual
  effect results. A rejected skill/target/rank/weapon combination backs off for
  two seconds while selection can choose another action. Actor-local feedback
  retains at most eight failures; misses and resists do not blacklist skills.
  Effective outcomes include actual healing, resource restoration and control,
  not only damage. Interrupted casts may have acceptance without a result.
- `HotBotPolicyOverlay`: passes party context along with existing personal hints.
  The PvP auto-attack review also passes the session to use the same reserve.
- `BotSupportPlanner`: single-target physical buffs include melee support classes;
  caster buffs exclude singers/dancers; Vampiric Rage is not individually cast for
  a bow user. Paagrio ally buffs use the native clan/alliance recipient resolver,
  including capacity checks for affected characters outside the supplied party.
  Dead recipients, unusable skills, stronger effects and pending casts are excluded.
- `BotClassProgression` restores skills from the entire ancestry before advancing
  professions. Training never replaces a higher learned rank with an ancestor rank.
- `BotSkillIntent`, `PartyClassTactics` and `BotPvpTactics` check actual targets,
  range, existing effects, resource costs and weapon conditions. Silence is aimed
  at casters; primary-target Sleep/Fear is reserved for escape. Cancel/Bane require
  a dispellable matching buff. Control claims prevent immediate repeated attempts.
  Raider/Destroyer low-HP actions respect the shared Frenzy/Guts stack; solo combat
  also dispatches the existing class self-support choices.
- PvP support prioritizes living wounded members that a usable heal can reach.
  A more wounded distant member does not block a reachable heal. Group healing
  requires native party context; support/control precedes offensive selection in
  the existing defense dispatcher. Social policy still authorizes aggression.
  A current attacker of a wounded support can preempt the shared focus. Otherwise
  focus is stable for two seconds, with protected-control targets excluded.
  Defense passes its resolved party context into both ongoing-attack review and
  fresh offensive selection, including the leader's MP reserve.
  `BotPvpPositioning` restores actual bow range under melee pressure through the
  native route preview and movement path. Companion destinations stay within
  900 units of their leader; an unsafe route yields to combat during retry delay.
- `BotGear` accepts live actors and nested population records consistently.
  Acquisition keeps its existing affordability, shop/craft and mastery rules.
  Autonomous archer spacing requires an equipped bow; a Scout holding a blunt
  does not use the bow movement policy.
- `BotArmorPolicy` compares complete available C4 sets using native modeled set
  bonuses, class-aware caster/physical utility and the existing acquisition
  budget. Hot and cold inventory upgrades preserve a useful complete set instead
  of replacing a part for a small isolated defense gain. SA and alternate
  wardrobes for individual modes remain deferred.
- Hunt readiness checks the actual class-compatible weapon and armor.
  `BotHuntEfficiency` records cold simulated fight duration and estimated recovery
  cost for at most eight spots, with a six-hour lifetime and three-sample minimum.
  The bounded route preference uses net XP after death penalties per modeled cycle and invalidates samples
  after class, level, equipped item/enchant, rate or solo/party context changes.
  Travel cost, material value and native empirical calibration are not modeled.
- Solo routing and voluntary target selection estimate damage deliverable before
  death using the learned attacks, cast/attack speed, MP budget, target defenses,
  HP and physical attack. Require 1.5 times the target HP as reserve; this is a
  conservative readiness estimate, not a full fight simulation. Mixed spots need
  at least 60% eligible spawn weight, and density preference saturates at 12 mobs.
  Each solo death lowers the desired hunting level by two (up to six); repeated
  deaths remain visible across 12-fight windows until 12 death-free wins.
  Recovery survives travel/restarts and eases by two levels after 12 wins and
  restored XP. Failed ground is excluded before movement changes the origin.
  Three abandoned solo fights also exclude the spot; a run of three clean wins
  clears that failure count, while rest and unfinished encounter slices do not.
  No additional recovery timer is used. Party risk remains roster-specific.
  A rejected capacity reservation excludes only that destination for 60 seconds,
  allowing the next decision to select another route without a death backoff.
  The exclusion applies to worker planning and pending farm reservations.
  A saved `craftReturn` destination alone does not route ordinary hunting to the
  command executor; active crafting and ready-to-craft plans still do.
  Lifecycle commands share the worker ownership limit with combat claims.
  A rejected command respects its retry delay even when it returns the unchanged
  overdue state, letting queued parties and solo hunters progress.
- `BotEncounterReadiness` shares voluntary solo fight HP/MP reserves between
  native hunting and cold simulation. A depleted cold hunter rests before a new
  pull, using actual regeneration time. Pending fights and aggressive
  interruptions still resolve combat instead of disappearing into recovery.
- `ColdClassPolicy` shares offensive selection and charge planning with hot bots
  through cached profile adapters. `WeaponMask` has no network/World dependency,
  so the cold worker retains dependency isolation. Cold fights still abstract
  movement and damage timing rather than executing native actions.
  Cold PvP explicitly selects solo/party PvP budgets and persists charge
  preparation, expiry, consumption and action timing across encounter slices.
- Cold tree/database skill snapshots now include template magic and cast/reuse
  metadata. Snapshot version 5 requests the existing bounded backfill for older
  database snapshots; hot snapshots already contain these fields. The adapter
  also fills missing legacy offense metadata while migration progresses.

Reserve fractions and score deltas are initial engineering preferences, not
historical facts or measured optimal rotations. A profile's equipment field
exposes the existing gear policy; this change does not replace gear acquisition.

## Source correction

Deadly Blow (263) now materializes ranks 22–37 using the full source power,
MP and magic-level tables, plus source cast/reuse timing and range. Reference:
Lisvus revision `fdc7e33af5d69067b41a6ee7cc7c07fe7aa35975`,
`datapack/data/stats/skills/0200-0299.xml`, skill 263.
The class graph and learned-skill index use the project's existing C4 data.

## Verification and limits

This is a shared gameplay baseline integrated with the existing summon, healing,
gear acquisition, social and party controllers. The research dossiers contain
more detailed recommendations than executable rules. Profile coverage does not
prove optimal play for every class, mob, party composition or PvP matchup. The
cold PvP resolver remains a bounded encounter model, not native rotation replay.
SA and empirical tuning of preferences are outside this implementation.

`tests/test_bot_class_policy.js` checks all 89 profiles in all four modes and
exercises route, support and combat consumers. Combat dispatch scenarios live in
`tests/test_bot_combat_skill_selection.js`. These are local checks, not evidence
of live-server behavior or a full simulation of all dossier scenarios.
`tests/test_bot_charge_sequences.js` additionally exercises 40 consecutive
dispatches with resource recovery, reuse transitions and charge consumption,
plus impossible-cap, full-cost, area-safety and dead-target regressions.

`test_bot_class_progression.js` compares restored skillbooks for all 89 class
stages against the cold ancestry tree. `test_bot_class_cold_parity.js` compares
11,392 hot/cold selections and charge plans across resources, all four modes, undead
targets and charges, and checks 589 valid class/grade boundary loadouts. It uses
the native skillbook population path as its hot reference and exercises reuse
changes against cached adapters. These counts describe assertions/scenarios,
not thousands of complete native fights.
Six additional active-servitor cases check the same summoner MP preference in
both execution modes.

`test_bot_class_intents.js` covers control benefit, claims, healing reachability,
OrcBuff replacement, actual-bow movement eligibility and native ally buff scope.
Existing gear acquisition, support, PvP, class skill, charge lifecycle and real
cold worker suites cover the retained controllers and their integration seams.

Focused suites additionally cover native cast rejection and replanning, rear-only
blows, complete-set retention, hunt cycle preferences, PvP focus protection and
bow movement. `test_cold_pvp_class_sequences.js` runs 180 virtual seconds each of
1v1 and 3v3, including serialized encounter transitions and repeated charge use.

Research-to-runtime traceability is generated in the ignored
`tmp/c4-class-context/runtime-map.{json,md}`. It links 2,136 specifications for
89 class stages to implementation, representative tests and explicit limits.
A linked scenario is not an individually executed or certified native fight.
Temporary runtime acceptance reports also live there; they are not runtime
dependencies. Controlled server bouts reset vitals between rounds, may use
low-HP rescue, and end on death or a duration limit. They test dispatch/results
rather than natural win rates.
