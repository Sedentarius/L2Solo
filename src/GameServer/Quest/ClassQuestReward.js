// The shared final reward of the C4 first-village class quests (Q101-Q108).
//
// Source: MOBIUS_C4 6674a607. Each of these quests ends with the same shaped
// bundle: a class-appropriate weapon, 100 Lesser Healing Potions, a no-grade
// shot stack that depends on the class, ten of each of the five Echo Crystals,
// and - only for an eligible beginner - the beginner shot grant.
//
// Collecting it here keeps the eight handlers honest about paying the same
// things, and lets the whole bundle commit inside one quest transaction.
const BeginnerReward = require('./BeginnerReward');

const LESSER_HEALING_POTION = 1060;
const SPIRITSHOT_NO_GRADE = 2509;
const SOULSHOT_NO_GRADE = 1835;
const ECHO_CRYSTALS = [4412, 4413, 4414, 4415, 4416];

// The class quests use the plain C4 isMageClass() with no Orc exclusion.
const isMage = actor => BeginnerReward.isMage(actor, false);

// Q101-Q108 all allow a second beginner grant, unlike the hunting bounties.
const BEGINNER = Object.freeze({ threshold: 2, soulshots: 7000, spiritshots: 3000 });
// Q107 is soulshot-only in the reference.
const BEGINNER_SOULSHOTS_ONLY = Object.freeze({ threshold: 2, soulshots: 7000, spiritshots: 0 });

/**
 * Builds the final reward for a class quest.
 * `weapon` is granted to everyone; `mageWeapon`, when given, replaces it for
 * mystics. `noGradeShots` adds the 500 spiritshot / 1000 soulshot stack.
 */
function bundle(actor, { weapon = null, mageWeapon = null, potions = 100,
    echoes = true, noGradeShots = true, soulshotsOnly = false } = {}) {
    const mage = isMage(actor);
    const gives = [];
    const awarded = mage && mageWeapon ? mageWeapon : weapon;
    if (awarded) gives.push([awarded, 1]);
    if (potions) gives.push([LESSER_HEALING_POTION, potions]);
    if (noGradeShots) {
        gives.push(mage ? [SPIRITSHOT_NO_GRADE, 500] : [SOULSHOT_NO_GRADE, 1000]);
    }
    if (echoes) for (const crystal of ECHO_CRYSTALS) gives.push([crystal, 10]);
    const beginner = BeginnerReward.plan(actor, soulshotsOnly ? BEGINNER_SOULSHOTS_ONLY : BEGINNER);
    if (beginner) gives.push(...beginner.items);
    return { gives, beginner: beginner ? { received: beginner.received } : null };
}

/**
 * Commits a class quest's final hand-in: the consumed objectives, the whole
 * reward bundle and the beginner receipt all land in one quest transaction.
 */
async function complete(state, { takes = [], ...bundleOptions } = {}) {
    const reward = bundle(state.session.actor, bundleOptions);
    await require('./QuestStep').apply(state, {
        takes,
        gives: reward.gives,
        status: 'completed',
        variables: { ...state.variables, cond: '0' },
        beginner: reward.beginner
    });
    state.playSound('ItemSound.quest_finish');
    return reward;
}

module.exports = {
    bundle, complete, isMage,
    LESSER_HEALING_POTION, SPIRITSHOT_NO_GRADE, SOULSHOT_NO_GRADE, ECHO_CRYSTALS,
    BEGINNER, BEGINNER_SOULSHOTS_ONLY
};
