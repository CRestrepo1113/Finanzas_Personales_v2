import { StorageService, INITIAL_DB } from './db.js';

class StateManager {
    constructor() {
        this.profilesState = null;
        this.activeProfile = null;
        this.db = null;
        this.listeners = [];
    }

    async init() {
        this.profilesState = await StorageService.loadProfiles();
        this.activeProfile = this.profilesState.profiles.find(p => String(p.id) === String(this.profilesState.activeProfileId));
        this.db = this.activeProfile.db;

        // Migración automática de tipos de cuenta y adición de propiedad budget
        let migrated = false;
        if (this.db.accounts) {
            this.db.accounts.forEach(acc => {
                if (acc.type === 'asset') {
                    acc.type = acc.name.toLowerCase().includes('ahorr') ? 'savings' : 'current';
                    migrated = true;
                } else if (acc.type === 'liability') {
                    acc.type = 'debt';
                    migrated = true;
                }
                if (acc.budget === undefined) {
                    acc.budget = 0;
                    migrated = true;
                }
            });
        }

        // Migración de categorías previamente configuradas como future
        if (this.db.categories) {
            this.db.categories.forEach(cat => {
                if (cat.subtype === 'future') {
                    cat.subtype = 'variable';
                    migrated = true;
                }
            });
        }

        if (migrated) {
            this.save();
        }

        this.notify();
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notify() {
        this.listeners.forEach(callback => callback(this.db));
        this.save();
    }

    async save() {
        await StorageService.saveProfiles(this.profilesState);
    }

    async importData(profiles) {
        this.profilesState.profiles = profiles;
        this.profilesState.activeProfileId = profiles[0].id;
        await this.save();
    }

    async switchProfile(id) {
        if (this.profilesState.profiles.some(p => String(p.id) === String(id))) {
            this.profilesState.activeProfileId = id;
            await this.save();
            location.reload();
        }
    }

    async addProfile(name, color, icon) {
        const newId = 'profile_' + Date.now();
        const freshDb = JSON.parse(JSON.stringify(INITIAL_DB));
        this.profilesState.profiles.push({
            id: newId,
            name: name.trim(),
            db: freshDb,
            color: color || '#8C9970',
            icon: icon || 'fa-user'
        });
        await this.save();
        location.reload();
    }

    async updateProfile(id, name, color, icon) {
        const p = this.profilesState.profiles.find(x => String(x.id) === String(id));
        if (p) {
            p.name = name.trim();
            p.color = color;
            p.icon = icon;
            await this.save();
            location.reload();
        }
    }

    async deleteProfile(id) {
        if (this.profilesState.profiles.length <= 1) {
            alert("No puedes eliminar el único perfil disponible.");
            return false;
        }
        this.profilesState.profiles = this.profilesState.profiles.filter(x => String(x.id) !== String(id));
        if (String(this.profilesState.activeProfileId) === String(id)) {
            this.profilesState.activeProfileId = this.profilesState.profiles[0].id;
        }
        await this.save();
        location.reload();
        return true;
    }

    // Métodos para mutar el estado (ejemplos iniciales)
    addTransaction(tx) {
        this.db.transactions.push({
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            ...tx
        });
        this.notify();
    }

    deleteTransaction(id) {
        const txIndex = this.db.transactions.findIndex(t => String(t.id) === String(id));
        if (txIndex === -1) return;
        
        const tx = this.db.transactions[txIndex];
        
        // Revertir balances
        if (tx.type === 'transfer') {
            const fromAcc = this.db.accounts.find(a => String(a.id) === String(tx.from_account_id));
            const toAcc = this.db.accounts.find(a => String(a.id) === String(tx.to_account_id));
            if (fromAcc) fromAcc.balance += tx.amount_extracted;
            if (toAcc) toAcc.balance -= tx.amount_received;
        } else {
            const cat = this.db.categories.find(c => String(c.id) === String(tx.category_id));
            if (cat) {
                const acc = this.db.accounts.find(a => String(a.id) === String(tx.account_id));
                if (acc) {
                    acc.balance += (cat.type === 'expense' ? tx.amount : -tx.amount);
                }
            }
        }
        
        this.db.transactions.splice(txIndex, 1);
        this.notify();
    }

    updateTransaction(id, updatedTx) {
        const txIndex = this.db.transactions.findIndex(t => String(t.id) === String(id));
        if (txIndex === -1) return;
        
        const oldTx = this.db.transactions[txIndex];
        
        // 1. Revertir balances del movimiento viejo
        if (oldTx.type === 'transfer') {
            const fromAcc = this.db.accounts.find(a => String(a.id) === String(oldTx.from_account_id));
            const toAcc = this.db.accounts.find(a => String(a.id) === String(oldTx.to_account_id));
            if (fromAcc) fromAcc.balance += oldTx.amount_extracted;
            if (toAcc) toAcc.balance -= oldTx.amount_received;
        } else {
            const cat = this.db.categories.find(c => String(c.id) === String(oldTx.category_id));
            if (cat) {
                const acc = this.db.accounts.find(a => String(a.id) === String(oldTx.account_id));
                if (acc) {
                    acc.balance += (cat.type === 'expense' ? oldTx.amount : -oldTx.amount);
                }
            }
        }
        
        // 2. Aplicar balances del movimiento nuevo
        if (updatedTx.type === 'transfer') {
            const fromAcc = this.db.accounts.find(a => String(a.id) === String(updatedTx.from_account_id));
            const toAcc = this.db.accounts.find(a => String(a.id) === String(updatedTx.to_account_id));
            if (fromAcc) fromAcc.balance -= updatedTx.amount_extracted;
            if (toAcc) toAcc.balance += updatedTx.amount_received;
        } else {
            const cat = this.db.categories.find(c => String(c.id) === String(updatedTx.category_id));
            if (cat) {
                const acc = this.db.accounts.find(a => String(a.id) === String(updatedTx.account_id));
                if (acc) {
                    acc.balance += (cat.type === 'expense' ? -updatedTx.amount : updatedTx.amount);
                }
            }
        }
        
        // 3. Reemplazar transacción en el estado
        this.db.transactions[txIndex] = {
            ...oldTx,
            ...updatedTx
        };
        
        this.notify();
     }

    updateAccountBalance(accountId, amount) {
        const account = this.db.accounts.find(a => String(a.id) === String(accountId));
        if (account) {
            account.balance += amount;
            this.notify();
        }
    }

    updateExchangeRates(newRates) {
        this.db.settings.exchangeRates = newRates;
        this.notify();
    }

    async updateBaseCurrency(newBase) {
        if (this.db.settings.baseCurrency !== newBase) {
            this.db.settings.baseCurrency = newBase;
            this.notify();
            if (window.CurrencyService) {
                await window.CurrencyService.updateRates();
            }
        }
    }

    updateCategoryBudgets(updates, zbbIncome = null, accountUpdates = []) {
        updates.forEach(upd => {
            const cat = this.db.categories.find(c => String(c.id) === String(upd.id));
            if (cat) cat.budget = parseFloat(upd.budget) || 0;
        });
        accountUpdates.forEach(upd => {
            const acc = this.db.accounts.find(a => String(a.id) === String(upd.id));
            if (acc) acc.budget = parseFloat(upd.budget) || 0;
        });
        if (zbbIncome !== null) {
            this.db.settings.zbbIncome = parseFloat(zbbIncome) || 0;
        }
        this.notify();
    }

    addAccount(acc) {
        this.db.accounts.push({ id: Date.now(), budget: 0, ...acc });
        this.notify();
    }

    updateAccount(id, data) {
        const index = this.db.accounts.findIndex(a => String(a.id) === String(id));
        if (index !== -1) {
            this.db.accounts[index] = { ...this.db.accounts[index], ...data };
            this.notify();
        }
    }

    deleteAccount(id) {
        this.db.accounts = this.db.accounts.filter(a => String(a.id) !== String(id));
        this.db.goals.forEach(g => {
            if (String(g.account_id) === String(id)) g.account_id = null;
        });
        this.db.transactions = this.db.transactions.filter(t => 
            String(t.account_id) !== String(id) && 
            String(t.from_account_id) !== String(id) && 
            String(t.to_account_id) !== String(id)
        );
        this.notify();
    }

    addCategory(cat) {
        this.db.categories.push({ id: Date.now(), ...cat, budget: 0 });
        this.notify();
    }

    updateCategory(id, data) {
        const index = this.db.categories.findIndex(c => String(c.id) === String(id));
        if (index !== -1) {
            this.db.categories[index] = { ...this.db.categories[index], ...data };
            this.notify();
        }
    }

    deleteCategory(id) {
        this.db.categories = this.db.categories.filter(c => String(c.id) !== String(id));
        this.db.transactions = this.db.transactions.filter(t => String(t.category_id) !== String(id));
        this.notify();
    }

    addGoal(goal) {
        this.db.goals.push({ id: Date.now(), current: 0, ...goal });
        this.notify();
    }

    updateGoal(id, data) {
        const index = this.db.goals.findIndex(g => String(g.id) === String(id));
        if (index !== -1) {
            this.db.goals[index] = { ...this.db.goals[index], ...data };
            this.notify();
        }
    }

    deleteGoal(id) {
        this.db.goals = this.db.goals.filter(g => String(g.id) !== String(id));
        this.notify();
    }

    fundGoal(id, amount) {
        const goal = this.db.goals.find(g => String(g.id) === String(id));
        if (goal) {
            goal.current = (goal.current || 0) + amount;
            this.notify();
        }
    }

    moveAccount(id, direction) {
        const index = this.db.accounts.findIndex(a => String(a.id) === String(id));
        if (index === -1) return;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= this.db.accounts.length) return;
        
        const temp = this.db.accounts[index];
        this.db.accounts[index] = this.db.accounts[newIndex];
        this.db.accounts[newIndex] = temp;
        this.notify();
    }

    moveCategory(id, direction) {
        const categories = this.db.categories;
        const index = categories.findIndex(c => String(c.id) === String(id));
        if (index === -1) return;
        
        const cat = categories[index];
        const sameTypeCats = categories.filter(c => c.type === cat.type);
        const indexInType = sameTypeCats.findIndex(c => String(c.id) === String(id));
        
        const newIndexInType = direction === 'up' ? indexInType - 1 : indexInType + 1;
        if (newIndexInType < 0 || newIndexInType >= sameTypeCats.length) return;
        
        const targetCat = sameTypeCats[newIndexInType];
        const targetGlobalIndex = categories.findIndex(c => String(c.id) === String(targetCat.id));
        
        // Swap en el arreglo global
        categories[index] = targetCat;
        categories[targetGlobalIndex] = cat;
        
        this.notify();
    }

    moveGoal(id, direction) {
        const index = this.db.goals.findIndex(g => String(g.id) === String(id));
        if (index === -1) return;
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= this.db.goals.length) return;
        
        const temp = this.db.goals[index];
        this.db.goals[index] = this.db.goals[newIndex];
        this.db.goals[newIndex] = temp;
        this.notify();
    }
}

export const State = new StateManager();
