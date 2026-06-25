export const DIALOGS_CONFIG = {
    width: '90%',
    maxWidth: '540px',
    maxHeight: '80vh',
    backdropClass: 'dialog-backdrop',
    autoFocus: false
};

export const DOCTOR_HEAL_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    maxWidth: '500px',
};

export const RESOURCE_EXCHANGE_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    maxWidth: '620px',
};

export const RESOURCE_INVENTORY_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    maxWidth: '680px',
};

export const FAST_TRAVEL_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    width: '92%',
    maxWidth: '780px',
    maxHeight: '72vh',
};

export const ENCHANTRESS_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    maxWidth: '560px',
};

export const VARIABLE_REWARD_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    width: '92%',
    maxWidth: '780px',
    maxHeight: '72vh',
};

export const MERCHANT_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    maxWidth: '760px',
};

export const SPELL_CAST_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    width: '50%',
    maxWidth: '320px',
    minWidth: '260px',
    height: '480px',
    maxHeight: '90vh',
    panelClass: ['dialog-backdrop-panel', 'spell-cast-dialog-panel'],
};

export const RULEBOOK_DIALOG_CONFIG = {
    ...DIALOGS_CONFIG,
    width: 'calc(100vw - 96px)',
    height: 'calc(100vh - 96px)',
    maxWidth: '1200px',
    maxHeight: 'calc(100vh - 96px)',
};