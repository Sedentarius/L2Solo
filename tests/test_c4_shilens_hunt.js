const assert = require('node:assert/strict');

const {
    createWorld
} = require('./helpers/c4QuestHarness');

const Response = invoke('GameServer/Network/Response');
const originalUserInfo = Response.userInfo;

// UserInfo needs the complete live Character interface. The quest test only
// needs to prove the reward/state/database behaviour, so suppress that
// unrelated packet rendering exactly as the existing quest regression tests do.
Response.userInfo = () => Buffer.from([0x04]);

async function main() {
    const world = await createWorld([{
        id: 165,
        name: 'ShilenHunter',
        race: 2,
        classId: 31,
        level: 6,
        exp: 0
    }], 'c4-shilens-hunt');

    try {
        let session = await world.session(165);

        // Race gate.
        session.actor.race = 0;

        assert.equal(
            await world.event(session, 165, 'start', 7348),
            false,
            'Q165 rejects another race'
        );

        // Level gate.
        session.actor.race = 2;
        session.actor.level = 2;

        assert.equal(
            await world.event(session, 165, 'start', 7348),
            false,
            'Q165 rejects level 2'
        );

        // Keep the runtime actor at level 6 so the 1000 EXP reward does not
        // make this focused quest test exercise unrelated LevelUp rendering.
        session.actor.level = 6;

        assert.equal(
            await world.event(session, 165, 'start', 7348),
            true,
            'Q165 starts for an eligible Dark Elf'
        );

        let state = world.state(session, 165);

        assert.equal(state.state, 'started');
        assert.equal(state.getInt('cond'), 1);

        // Unrelated monsters never count.
        await world.kill(session, 999999);

        assert.equal(
            await world.amount(165, 1160),
            0
        );

        // Quest target 456 has an authored 100% Dark Bezoar drop.
        for (let n = 0; n < 12; n++)
            await world.kill(session, 456);

        assert.equal(
            await world.amount(165, 1160),
            12
        );

        assert.equal(
            state.getInt('cond'),
            1
        );

        // The collection survives a database/server reopen.
        session = await world.reopen(165);
        state = world.state(session, 165);

        assert.equal(state.state, 'started');

        assert.equal(
            await world.amount(165, 1160),
            12
        );

        await world.kill(session, 456);

        assert.equal(
            await world.amount(165, 1160),
            13
        );

        assert.equal(
            state.getInt('cond'),
            2
        );

        // Further kills cannot overfill the objective.
        for (let n = 0; n < 3; n++)
            await world.kill(session, 456);

        assert.equal(
            await world.amount(165, 1160),
            13,
            'Dark Bezoars stop at the authored target'
        );

        const expBefore = session.actor.fetchExp();

        // Returning to Nelsya performs the real hand-in.
        await world.talk(session, 7348);

        state = world.state(session, 165);

        assert.equal(
            state.state,
            'completed'
        );

        assert.equal(
            await world.amount(165, 1160),
            0,
            'hand-in consumes all 13 Dark Bezoars'
        );

        assert.equal(
            await world.amount(165, 1060),
            5,
            'Q165 awards five Healing Potions'
        );

        assert.equal(
            session.actor.fetchExp() - expBefore,
            1000,
            'Q165 awards exactly 1000 authored EXP'
        );

        // Reopening proves state, inventory and queued EXP reached SQLite.
        session = await world.reopen(165);

        assert.equal(
            world.state(session, 165).state,
            'completed'
        );

        assert.equal(
            await world.amount(165, 1060),
            5
        );

        assert.equal(
            Number((await world.character(165)).exp),
            expBefore + 1000,
            'Q165 EXP persists across restart'
        );

        // Completed quest cannot be restarted or farmed.
        assert.equal(
            await world.event(session, 165, 'start', 7348),
            false
        );

        await world.talk(session, 7348);

        assert.equal(
            await world.amount(165, 1060),
            5,
            'completed Q165 cannot duplicate its reward'
        );

        console.log(
            "C4 Q165 Shilen's Hunt: eligibility, authored drop, cap, " +
            "restart persistence, exact reward and replay rejection passed"
        );
    } finally {
        Response.userInfo = originalUserInfo;
        await world.close();
    }
}

main().catch(error => {
    Response.userInfo = originalUserInfo;
    console.error(error);
    process.exitCode = 1;
});
