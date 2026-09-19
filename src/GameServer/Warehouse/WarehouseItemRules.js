function canDeposit(item) {
    return !item.fetchEquipped?.() && !item.fetchPetLocked?.()
        && item.fetchKind?.() !== 'Other.Quest'
        && Number(item.fetchClass2?.()) !== 3;
}

module.exports = { canDeposit };
