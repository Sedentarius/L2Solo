const MANUEL = 7293;
const ALLANA = 7424;
const PERRIN = 7428;

const LIZARDMAN_WARRIOR = 5032;
const LIZARDMAN_SCOUT = 5033;
const LIZARDMAN = 5034;
const TAMATO = 5035;

const CRYSTAL_MEDALLION = 1231;
const MONEY_OF_SWINDLER = 1232;
const DIARY_OF_ALLANA = 1233;
const LIZARD_CAPTAIN_ORDER = 1234;
const LEAF_OF_ORACLE = 1235;
const HALF_OF_DIARY = 1236;
const TAMATOS_NECKLACE = 1275;

const ACCEPT = "ItemSound.quest_accept";
const MIDDLE = "ItemSound.quest_middle";
const FINISH = "ItemSound.quest_finish";

function service() {
  return invoke("GameServer/Quest/QuestService");
}

function page(title, text, action = "") {
  return `<html><body>${title}:<br>${text}<br><br>${action}</body></html>`;
}

function count(state, selfId) {
  return state.session.actor.backpack.fetchItemFromSelfId(selfId)?.fetchAmount() || 0;
}

module.exports = {
  id: 409,
  name: "Path to Elven Oracle",
  npcs: [MANUEL, ALLANA, PERRIN],
  startNpcs: [MANUEL],
  killNpcs: [LIZARDMAN_WARRIOR, LIZARDMAN_SCOUT, LIZARDMAN, TAMATO],
  questSpawns: [LIZARDMAN_WARRIOR, LIZARDMAN_SCOUT, LIZARDMAN, TAMATO],
  eventNpc: (event) => ({ start: MANUEL, lizardmen: ALLANA, tamato: PERRIN })[event] ?? null,

  async onEvent(state, event) {
    const quest = service();
    const actor = state.session.actor;
    if (event === "start" && !state.isStarted() && !state.isCompleted()) {
      if (Number(actor.fetchClassId()) !== 25 || Number(actor.fetchLevel()) < 19 || count(state, LEAF_OF_ORACLE)) return null;
      await state.setState("started");
      await state.set("cond", 1);
      await quest.giveItem(state.session, CRYSTAL_MEDALLION, 1);
      state.playSound(ACCEPT);
      return page("Manuel", "Investigate the false prophet Allana.");
    }
    // The spawned captain can be killed by another player before its owner
    // reaches it.  Keep the encounter retryable until the captain's order is
    // actually obtained (as in the source quest), rather than stranding the
    // owner at condition 2.
    if (event === "lizardmen" && [1, 2].includes(state.getInt("cond")) && count(state, CRYSTAL_MEDALLION)) {
      for (const selfId of [LIZARDMAN_WARRIOR, LIZARDMAN_SCOUT, LIZARDMAN]) state.addSpawn(selfId);
      if (state.getInt("cond") === 1) await state.set("cond", 2);
      return page("Allana", "The lizardmen have appeared. Defend Allana.");
    }
    // Tamato can be re-challenged while Perrin still owes Allana, but never
    // once Perrin has paid: the necklace is not a renewable source of money.
    if (event === "tamato" && [4, 5].includes(state.getInt("cond")) && !count(state, TAMATOS_NECKLACE)) {
      state.addSpawn(TAMATO);
      return page("Perrin", "Tamato is coming to defend Perrin.");
    }
    return null;
  },

  async onTalk(state, npc) {
    const npcId = Number(npc.fetchSelfId());
    const quest = service();
    const cond = state.getInt("cond");

    if (state.isCompleted()) return page("Manuel", "You have already completed the Path to Elven Oracle.");
    if (!state.isStarted()) {
      const actor = state.session.actor;
      if (npcId !== MANUEL || Number(actor.fetchClassId()) !== 25) return page("Quest", "This path is not for your current class.");
      if (count(state, LEAF_OF_ORACLE)) return page("Manuel", "You have already earned the Leaf of Oracle.");
      return Number(actor.fetchLevel()) < 19
        ? page("Manuel", "Come back after reaching level 19.")
        : page("Manuel", "Do you seek the path of an Elven Oracle?", '<a action="bypass -h quest 409 start">Accept the trial.</a>');
    }

    if (npcId === MANUEL) {
      if (count(state, LEAF_OF_ORACLE)) return page("Manuel", "You have already earned the Leaf of Oracle.");
      if (cond < 7) return page("Manuel", "Investigate the false prophet Allana.");
      const profession = await quest.awardFirstProfession(state, 29,
        [MONEY_OF_SWINDLER, DIARY_OF_ALLANA, LIZARD_CAPTAIN_ORDER, CRYSTAL_MEDALLION].map((id) => [id, 1]));
      if (!profession.ok) {
        return page("Manuel", profession.reason === "level"
          ? `Reach level ${profession.requiredLevel} to become an Elven Oracle.`
          : "Your profession could not be granted. Keep your quest items and try again.");
      }
      state.playSound(FINISH);
      return page("Manuel", "You have completed the Path to Elven Oracle. Present your proof for class transfer at level 20.");
    }

    if (npcId === ALLANA) {
      if (cond === 1) return page("Allana", "The lizardmen are coming.", '<a action="bypass -h quest 409 lizardmen">Stand guard.</a>');
      if (cond === 2) return page("Allana", "Defeat the lizardman captain.");
      if (cond === 3) {
        await require("../QuestStep").apply(state, {
          gives: [[HALF_OF_DIARY, 1]],
          variables: { ...state.variables, cond: "4" },
        });
        state.playSound(MIDDLE);
        return page("Allana", "Half my diary is missing. Perrin owes me money; find him.");
      }
      if (cond === 4 || cond === 5) return page("Allana", "Perrin owes me money. Please find him.");
      if (cond === 6) {
        await require("../QuestStep").apply(state, {
          takes: [[HALF_OF_DIARY, count(state, HALF_OF_DIARY)]],
          gives: [[DIARY_OF_ALLANA, 1]],
          variables: { ...state.variables, cond: "7" },
        });
        state.playSound(MIDDLE);
        return page("Allana", "Take my diary to Manuel.");
      }
      return page("Allana", "Return to Manuel.");
    }

    if (npcId === PERRIN) {
      if (cond === 4) return page("Perrin", "You will not get Allana's money.", '<a action="bypass -h quest 409 tamato">Challenge Tamato.</a>');
      if (cond === 5) {
        await require("../QuestStep").apply(state, {
          takes: [[TAMATOS_NECKLACE, count(state, TAMATOS_NECKLACE)]],
          gives: [[MONEY_OF_SWINDLER, 1]],
          variables: { ...state.variables, cond: "6" },
        });
        state.playSound(MIDDLE);
        return page("Perrin", "Take the money to Allana.");
      }
      if (cond > 5) return page("Perrin", "I have already paid Allana.");
      return page("Perrin", "I have nothing to say to you.");
    }

    return page("Quest", "Continue your trial.");
  },

  async onKill(state, npc) {
    if (!state.isStarted()) return;
    const npcId = Number(npc.fetchSelfId());
    const cond = state.getInt("cond");
    if (npcId === LIZARDMAN_WARRIOR && cond === 2) {
      await require("../QuestStep").apply(state, {
        gives: [[LIZARD_CAPTAIN_ORDER, 1]],
        variables: { ...state.variables, cond: "3" },
      });
      state.playSound(MIDDLE);
    } else if (npcId === TAMATO && cond === 4) {
      await require("../QuestStep").apply(state, {
        gives: [[TAMATOS_NECKLACE, 1]],
        variables: { ...state.variables, cond: "5" },
      });
      state.playSound(MIDDLE);
    }
  },
};
