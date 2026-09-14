const assert = require('assert');
require('../src/Global');
const Data = invoke('GameServer/DataCache'); Data.init();
const Armor = invoke('GameServer/Bot/AI/BotArmorPolicy');
const Upgrade = invoke('GameServer/Bot/AI/BotEquipmentUpgrade');
const Acquisition = invoke('GameServer/Bot/AI/GearAcquisitionPlanner');
const Item = invoke('GameServer/Item/Item');
const get = id => Data.items.find(item => item.selfId === id);
const set = [1101,1104,44].map(get);
assert(set.every(Boolean));
const old = set.map((item,i) => new Item(100+i,{...utils.crushOb(item),equipped:true}));
const replacementTemplate = Data.items.find(item => item.etc?.rank === 'none' && item.etc.slot === 6
    && item.stats.pDef > get(44).stats.pDef && item.stats.pDef < get(44).stats.pDef + 15 && item.template.price > 0);
assert(replacementTemplate);
const replacement = new Item(110,{...utils.crushOb(replacementTemplate),equipped:false});
const items = [...old,replacement];
const actor = { fetchClassId: () => 15, fetchLevel: () => 19,
    backpack: { fetchItems: () => items, fetchEquippedWeapon: () => null,
        fetchPaperdollId: slot => old.find(item => item.fetchSlot() === slot)?.fetchId(),
        fetchItemRaw: id => items.find(item => item.fetchId() === id) } };
const session = { actor, accountId: 'bot_armor' };
assert(Armor.score(set,'healer') > Armor.score([set[0],set[1],replacementTemplate],'healer'), 'cast speed can outweigh a small helmet defense gain');
assert(Armor.score(set,'buffer',17) > Armor.score(set,'buffer',21), 'Prophet values casting bonuses; Sword Singer uses the physical support profile');
assert.deepStrictEqual(Upgrade.findBestUpgrades(session), [], 'native equipment retains useful complete robe set');
assert.strictEqual(Upgrade.applyCandidate(session,110,{force:true}).reason,'not_an_upgrade','manual bot equip tool uses the same complete-set decision');
const inventory = Object.fromEntries([...set,replacementTemplate].map(item => [item.selfId,{selfId:item.selfId,amount:1,
    slot:item.etc.slot,equipped:item.selfId!==replacementTemplate.selfId,equippedSlots:item.selfId!==replacementTemplate.selfId?[item.etc.slot]:[]}]));
const state = { level:19,stats:{classId:15},inventory };
const cold = Acquisition.equipInventoryUpgrades(state,inventory);
assert(cold[44].equipped && !cold[replacementTemplate.selfId].equipped,'cold equipment keeps the same complete set');
assert.deepStrictEqual(Acquisition.equipInventoryUpgrades({...state,inventory:cold},cold),cold,'repeated optimization is stable');
const missing = {...inventory}; delete missing[44];
const incomplete = Acquisition.equipInventoryUpgrades({...state,inventory:missing},missing);
assert(incomplete[replacementTemplate.selfId].equipped,'missing set parts do not fabricate a set bonus');
const bow = Data.items.find(item => item.template.kind==='Weapon.Bow' && item.etc.rank==='none');
const wrongWeapon = {level:19,stats:{classId:15},inventory:{[bow.selfId]:{selfId:bow.selfId,amount:1,equipped:true,slot:bow.etc.slot}}};
assert.strictEqual(Acquisition.combatReadiness(wrongWeapon).hasWeapon,false,'hunt readiness cannot count a weapon incompatible with the planned class build');
assert.strictEqual(Acquisition.partyNeedReasonForSource(wrongWeapon,{npcLevel:1}),'missing_weapon');
const optimized = Armor.optimize([set[0],set[1],replacementTemplate],[...set,replacementTemplate],{role:'healer',budget:0});
assert(!Armor.completeSets(optimized).length,'set planning respects the acquisition budget');
console.log('Complete armor value, hot/cold equipment stability, budget and hunt readiness passed');
