const ClassQuestReward = require('../ClassQuestReward');
const R = 7008,
  A = 7283,
  RL = 796,
  DIR = 937,
  T = 741,
  B = 740,
  N = 742,
  H = 739,
  S = 738,
  HP = 1060,
  SP = 5790,
  SS = 5789,
  E = [4412, 4413, 4414, 4415, 4416];
const Q = () => invoke("GameServer/Quest/QuestService"),
  p = (t, x, a = "") => `<html><body>${t}:<br>${x}<br><br>${a}</body></html>`,
  n = (s, id) =>
    s.session.actor.backpack.fetchItemFromSelfId(id)?.fetchAmount() || 0;
module.exports = {
  id: 101,
  name: "Sword of Solidarity",
  npcs: [R, A],
  startNpcs: [R],
  killNpcs: [361, 362],
  eventNpc: (e) =>
    ({ start: R, dir: A, note: A, handle: R, reward: A })[e] ?? null,
  async onEvent(s, e) {
    const q = Q(),
      a = s.session.actor;
    if (e === "start" && !s.isStarted()) {
      if (Number(a.fetchRace()) !== 0 || Number(a.fetchLevel()) < 9)
        return null;
      await s.setState("started");
      await s.set("cond", 1);
      await q.giveItem(s.session, RL, 1);
      s.playSound("ItemSound.quest_accept");
      return p("Roien", "Take this letter to Altran.");
    }
    const x = {
      dir: [1, 2, RL, DIR],
      note: [3, 4, DIR, N],
      handle: [4, 5, N, H],
    }[e];
    if (x && s.getInt("cond") === x[0]) {
      const takes = (e === "note" ? [DIR, T, B] : [x[2]]).map((z) => [z, 1]);
      if (takes.some(([z, c]) => n(s, z) < c)) return null;
      // Consume the carried items, issue the next one and advance in one step.
      await require("../QuestStep").apply(s, {
        takes,
        gives: [[x[3], 1]],
        variables: { ...s.variables, cond: String(x[1]) },
      });
      s.playSound("ItemSound.quest_middle");
      return p("Quest", "Continue the task.");
    }
    if (e === "reward" && s.getInt("cond") === 5) {
      if (!n(s, H)) return null;
      // One transaction: the handle is consumed and the whole bundle is paid.
      await ClassQuestReward.complete(s, {
        takes: [[H, 1]], weapon: S, noGradeShots: false,
      });
      return p("Altran", "The Sword of Solidarity is yours.");
    }
    return null;
  },
  async onTalk(s, x) {
    const id = Number(x.fetchSelfId()),
      c = s.getInt("cond"),
      a = s.session.actor;
    if (s.isCompleted())
      return p("Quest", "You have already completed this quest.");
    if (!s.isStarted())
      return id === R &&
        Number(a.fetchRace()) === 0 &&
        Number(a.fetchLevel()) >= 9
        ? p(
            "Roien",
            "Will you restore the sword?",
            '<a action="bypass -h quest 101 start">Accept.</a>',
          )
        : p("Roien", "Humans of level 9 or higher only.");
    const e =
      id === A
        ? c === 1
          ? "dir"
          : c === 3
            ? "note"
            : c === 5
              ? "reward"
              : null
        : c === 4
          ? "handle"
          : null;
    return e
      ? p(
          "Quest",
          "Continue. ",
          `<a action="bypass -h quest 101 ${e}">Continue.</a>`,
        )
      : p("Quest", "Continue the restoration.");
  },
  async onKill(s) {
    if (s.getInt("cond") !== 2 || Math.random() >= 0.2) return;
    const id = n(s, T) ? B : T;
    if (n(s, id)) return;
    const complete = Boolean(n(s, id === T ? B : T));
    // The fragment and the cond it completes are written together.
    await require("../QuestStep").apply(s, {
      gives: [[id, 1]],
      variables: { ...s.variables, cond: String(complete ? 3 : 2) },
    });
    s.playSound(complete ? "ItemSound.quest_middle" : "ItemSound.quest_itemget");
  },
};
