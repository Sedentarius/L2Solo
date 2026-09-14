// L2WeaponType.mask() values used by the C4 weaponsAllowed condition.
// Kept independent of native actors/networking for cold combat workers.
const MASK_BY_KIND = Object.freeze({
    'Weapon.Sword': 4,
    'Weapon.Blunt': 8,
    'Weapon.Knife': 16,
    'Weapon.Bow': 32,
    'Weapon.Pole': 64,
    'Weapon.Fist': 256,
    'Weapon.Dual': 512,
    'Weapon.DualFist': 1024,
    'Weapon.GreatSword': 2048,
    'Weapon.BigBlunt': 16384
});

function weaponMaskFor(actor) {
    const kind = actor?.backpack?.fetchTotalWeaponKind?.() || '';
    const hasShield = (actor?.backpack?.fetchEquippedArmors?.() || [])
        .some(item => item?.fetchKind?.() === 'Armor.Shield');
    return (MASK_BY_KIND[kind] || 0) | (hasShield ? 1048576 : 0);
}

module.exports = { weaponMaskFor };
