const ClassQuestReward = require('../ClassQuestReward');
const T = 7358,
  K = 7133,
  X = 984,
  Y = 985,
  SC = 986,
  CL = 987,
  TR = 988,
  D = 989,
  HP = 1060,
  E = [4412, 4413, 4414, 4415, 4416];
const Q = () => invoke("GameServer/Quest/QuestService");
const p = (t, x, a = "") =>
  `<html><body>${t}:<br>${x}<br><br>${a}</body></html>`;
const n = (s, id) =>
  s.session.actor.backpack.fetchItemFromSelfId(id)?.fetchAmount() || 0;
module.exports = {
  id: 106,
  name: "Forgotten Truth",
  npcs: [T, K],
  startNpcs: [T],
  killNpcs: [5070],
  eventNpc: (e) => (e === "start" ? T : null),
  async onEvent(s, e) {
    const a = s.session.actor;
    if (
      e !== "start" ||
      s.isStarted() ||
      Number(a.fetchRace()) !== 2 ||
      Number(a.fetchLevel()) < 10
    )
      return null;
    await s.setState("started");
    await s.set("cond", 1);
    await Q().giveItem(s.session, X, 1);
    s.playSound("ItemSound.quest_accept");
    return p("Thifiell", "Take the talisman to Kartia.");
  },
  async onTalk(s, x) {
    const id = Number(x.fetchSelfId()),
      a = s.session.actor,
      q = Q(),
      c = s.getInt("cond");
    if (s.isCompleted())
      return p("Quest", "You have already completed this quest.");
    if (!s.isStarted())
      return id === T &&
        Number(a.fetchRace()) === 2 &&
        Number(a.fetchLevel()) >= 10
        ? p(
            "Thifiell",
            "Will you recover the truth?",
            '<a action="bypass -h quest 106 start">Accept.</a>',
          )
        : p("Thifiell", "Only dark elves of level 10 or higher.");
    if (id === K && c === 1) {
      await q.takeItem(s.session, X);
      await q.giveItem(s.session, Y, 1);
      await s.set("cond", 2);
      s.playSound("ItemSound.quest_middle");
      return p("Kartia", "Find the scroll and tablet.");
    }
    if (id === K && c === 3) {
      for (const z of [Y, SC, CL]) await q.takeItem(s.session, z);
      await q.giveItem(s.session, TR, 1);
      await s.set("cond", 4);
      s.playSound("ItemSound.quest_middle");
      return p("Kartia", "Return to Thifiell.");
    }
    if (id === T && c === 4) {
      await ClassQuestReward.complete(s, { takes: [[TR, 1]], weapon: D });
      return p("Thifiell", "The forgotten truth is restored.");
    }
    return p(id === K ? "Kartia" : "Thifiell", "Continue your task.");
  },
  async onKill(s) {
    if (s.getInt("cond") !== 2 || Math.random() >= 0.2) return;
    const id = n(s, SC) ? CL : SC;
    if (n(s, id)) return;
    await Q().giveItem(s.session, id, 1);
    if (n(s, SC) && n(s, CL)) {
      await s.set("cond", 3);
      s.playSound("ItemSound.quest_middle");
    } else s.playSound("ItemSound.quest_itemget");
  },
};
