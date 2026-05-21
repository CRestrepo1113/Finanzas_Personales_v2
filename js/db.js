export const INITIAL_DB = {
    settings: {
        baseCurrency: 'USD',
        exchangeRates: { 'USD': 1, 'EUR': 0.92, 'COP': 3900, 'RUB': 90 }
    },
    accounts: [
        { id: 1, name: 'Cuenta de Ahorros', currency: 'USD', balance: 0.00, type: 'asset', color: '#A5BCA6' },
        { id: 2, name: 'Tarjeta Principal', currency: 'USD', balance: 0.00, type: 'liability', color: '#D9A098' }
    ],
    categories: [
        { id: 1, name: 'Sueldo', type: 'income', subtype: 'fixed', visual_color: '#005F56', icon: 'fa-briefcase', budget: 0 },
        { id: 2, name: 'Vivienda', type: 'expense', subtype: 'fixed', visual_color: '#2B2B2B', icon: 'fa-home', budget: 0 },
        { id: 3, name: 'Alimentación', type: 'expense', subtype: 'variable', visual_color: '#B23A1E', icon: 'fa-shopping-basket', budget: 0 }
    ],
    transactions: [],
    goals: []
};

export class StorageService {
    static DB_NAME = 'FinanceAppV2';
    static DB_VERSION = 1;
    static STORE_NAME = 'profiles_state';
    static STORAGE_KEY = 'finance_profiles_v2';

    static async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    static async loadProfiles() {
        // 1. Intentar cargar desde IndexedDB
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const data = await new Promise((res) => {
                const req = store.get('current_state');
                req.onsuccess = () => res(req.result);
            });

            if (data) return data;
        } catch (e) {
            console.warn("IndexedDB no disponible, intentando localStorage...", e);
        }

        // 2. Fallback a localStorage (para migración o navegadores viejos)
        const localData = localStorage.getItem(this.STORAGE_KEY);
        if (localData) {
            const parsed = JSON.parse(localData);
            await this.saveProfiles(parsed); // Migrar a IndexedDB
            return parsed;
        }

        // 3. Si no hay nada, inicializar por defecto
        return this.initDefaultProfile();
    }

    static async saveProfiles(state) {
        // Guardar en IndexedDB
        try {
            const db = await this.openDB();
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.put(state, 'current_state');
            
            // Mirror en localStorage por redundancia crítica
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Error guardando en IndexedDB:", e);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        }
    }

    static initDefaultProfile() {
        const state = {
            activeProfileId: 'profile_1',
            profiles: [
                { 
                    id: 'profile_1', 
                    name: 'Principal', 
                    db: INITIAL_DB,
                    color: '#8C9970',
                    icon: 'fa-user'
                }
            ]
        };
        this.saveProfiles(state);
        return state;
    }
}
