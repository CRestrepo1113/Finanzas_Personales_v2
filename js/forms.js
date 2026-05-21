import { State } from './state.js';
import { UI } from './ui.js';

export const FormService = {
    currentType: 'expense',

    init() {
        // Asignar eventos a los botones de acción (Gasto, Ingreso, Transferir)
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'transfer') this.openTransferModal();
                else this.openTransactionModal(action);
            });
        });

        // Eventos de botones de añadir en Configuración
        const addAccBtn = document.getElementById('add-account-btn');
        if (addAccBtn) addAccBtn.onclick = () => this.openAccountModal();
        
        const addCatBtn = document.getElementById('add-category-btn');
        if (addCatBtn) addCatBtn.onclick = () => this.openCategoryModal();

        const addGoalBtn = document.getElementById('add-goal-btn');
        if (addGoalBtn) addGoalBtn.onclick = () => this.openGoalModal();

        const profileMgrBtn = document.getElementById('btn-profile-manager');
        if (profileMgrBtn) profileMgrBtn.onclick = () => this.openProfileManager();

        const createProfileBtn = document.getElementById('btn-create-profile');
        if (createProfileBtn) createProfileBtn.onclick = () => this.openProfileEditModal();

        const deleteProfileBtn = document.getElementById('profile-delete-btn');
        if (deleteProfileBtn) deleteProfileBtn.onclick = () => this.handleProfileDelete();

        const txDeleteBtn = document.getElementById('tx-delete-btn');
        if (txDeleteBtn) txDeleteBtn.onclick = () => this.handleTransactionDelete();
        
        const transDeleteBtn = document.getElementById('trans-delete-btn');
        if (transDeleteBtn) transDeleteBtn.onclick = () => this.handleTransferDelete();

        // Eventos de cierre
        const closeBtns = {
            'close-modal': 'transaction-modal',
            'close-transfer-modal': 'transfer-modal',
            'close-acc-modal': 'account-modal',
            'close-cat-modal': 'category-modal',
            'close-goal-modal': 'goal-modal',
            'close-fund-modal': 'fund-goal-modal',
            'close-profile-manager': 'profile-manager-modal',
            'close-profile-edit': 'profile-edit-modal',
            'close-account-history': 'account-history-modal'
        };

        Object.entries(closeBtns).forEach(([btnId, modalId]) => {
            const btn = document.getElementById(btnId);
            if (btn) btn.onclick = () => this.hideModal(modalId);
        });

        // Envío de formularios (Con protección)
        const forms = {
            'transaction-form': (e) => this.handleTransactionSubmit(e),
            'transfer-form': (e) => this.handleTransferSubmit(e),
            'account-form': (e) => this.handleAccountSubmit(e),
            'category-form': (e) => this.handleCategorySubmit(e),
            'goal-form': (e) => this.handleGoalSubmit(e),
            'fund-goal-form': (e) => this.handleFundGoalSubmit(e),
            'profile-edit-form': (e) => this.handleProfileSubmit(e)
        };

        Object.entries(forms).forEach(([formId, handler]) => {
            const form = document.getElementById(formId);
            if (form) form.onsubmit = handler;
        });

        // Inicializar selectores visuales (Colores e Iconos)
        this.setupVisualSelectors();
    },

    setupVisualSelectors() {
        // Selectores de Color
        document.querySelectorAll('.color-selector').forEach(selector => {
            const input = selector.parentElement.querySelector('input[type="hidden"]');
            selector.querySelectorAll('.color-swatch').forEach(swatch => {
                swatch.onclick = () => {
                    selector.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                    swatch.classList.add('selected');
                    input.value = swatch.dataset.color;
                };
            });
        });

        // Selector de Iconos
        const iconSelector = document.getElementById('cat-icon-selector');
        if (iconSelector) {
            const iconInput = document.getElementById('cat-icon');
            iconSelector.querySelectorAll('i').forEach(icon => {
                icon.onclick = () => {
                    iconSelector.querySelectorAll('i').forEach(i => i.classList.remove('selected'));
                    icon.classList.add('selected');
                    iconInput.value = icon.dataset.icon;
                };
            });
        }

        // Selector de Iconos de Perfil
        const profileIconSelector = document.getElementById('profile-icon-selector');
        if (profileIconSelector) {
            const profileIconInput = document.getElementById('profile-icon');
            profileIconSelector.querySelectorAll('i').forEach(icon => {
                icon.onclick = () => {
                    profileIconSelector.querySelectorAll('i').forEach(i => i.classList.remove('selected'));
                    icon.classList.add('selected');
                    profileIconInput.value = icon.dataset.icon;
                };
            });
        }
    },

    // --- UTILIDAD DE FECHA LOCAL ---

    // Devuelve la fecha actual en formato YYYY-MM-DD usando la hora LOCAL del dispositivo
    // (evita el desfase de UTC que hace que new Date().toISOString() adelante el día en zonas UTC-)
    getLocalDateString() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    // --- MODALES DE TRANSACCIÓN ---

    openTransactionModal(type) {
        this.currentType = type;
        const modal = document.getElementById('transaction-modal');
        const title = document.getElementById('modal-title');
        const catSelect = document.getElementById('tx-category');
        const accSelect = document.getElementById('tx-account');
        const deleteBtn = document.getElementById('tx-delete-btn');
        const submitBtn = document.getElementById('tx-save-btn');

        title.textContent = type === 'expense' ? 'Registrar Gasto' : 'Registrar Ingreso';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (submitBtn) submitBtn.textContent = 'Guardar';

        document.getElementById('tx-id').value = '';
        accSelect.innerHTML = State.db.accounts.map(a => `<option value="${a.id}">${a.name} (${a.currency})</option>`).join('');
        catSelect.innerHTML = State.db.categories.filter(c => c.type === type).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        document.getElementById('tx-date').value = this.getLocalDateString();
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-notes').value = '';
        modal.classList.remove('hidden');
    },

    openTransferModal(fromId = null, toId = null) {
        const modal = document.getElementById('transfer-modal');
        const title = document.getElementById('transfer-modal-title');
        const fromSelect = document.getElementById('trans-from');
        const toSelect = document.getElementById('trans-to');
        const deleteBtn = document.getElementById('trans-delete-btn');
        const submitBtn = document.getElementById('trans-save-btn');

        if (title) title.textContent = 'Transferencia';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (submitBtn) submitBtn.textContent = 'Realizar Transferencia';

        document.getElementById('trans-id').value = '';
        const options = State.db.accounts.map(a => `<option value="${a.id}">${a.name} (${a.currency})</option>`).join('');
        fromSelect.innerHTML = options;
        toSelect.innerHTML = options;

        if (fromId) fromSelect.value = fromId;
        if (toId) toSelect.value = toId;

        document.getElementById('trans-date').value = this.getLocalDateString();
        document.getElementById('trans-amount').value = '';
        // Resetear comisión a 0 cada vez que se abre el modal
        const feeInput = document.getElementById('trans-fee');
        if (feeInput) feeInput.value = '0';
        modal.classList.remove('hidden');
    },

    openTransactionEditModal(id) {
        const tx = State.db.transactions.find(t => String(t.id) === String(id));
        if (!tx) return;

        if (tx.type === 'transfer') {
            const modal = document.getElementById('transfer-modal');
            const title = document.getElementById('transfer-modal-title');
            const fromSelect = document.getElementById('trans-from');
            const toSelect = document.getElementById('trans-to');
            const deleteBtn = document.getElementById('trans-delete-btn');
            const submitBtn = document.getElementById('trans-save-btn');

            if (title) title.textContent = 'Editar Transferencia';
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (submitBtn) submitBtn.textContent = 'Guardar';

            const options = State.db.accounts.map(a => `<option value="${a.id}">${a.name} (${a.currency})</option>`).join('');
            fromSelect.innerHTML = options;
            toSelect.innerHTML = options;

            document.getElementById('trans-id').value = tx.id;
            document.getElementById('trans-date').value = tx.date;
            fromSelect.value = tx.from_account_id;
            toSelect.value = tx.to_account_id;
            document.getElementById('trans-amount').value = tx.amount_extracted - (tx.fee || 0);
            document.getElementById('trans-fee').value = tx.fee || 0;

            modal.classList.remove('hidden');
        } else {
            const modal = document.getElementById('transaction-modal');
            const title = document.getElementById('modal-title');
            const catSelect = document.getElementById('tx-category');
            const accSelect = document.getElementById('tx-account');
            const deleteBtn = document.getElementById('tx-delete-btn');
            const submitBtn = document.getElementById('tx-save-btn');

            const cat = State.db.categories.find(c => String(c.id) === String(tx.category_id)) || { type: 'expense' };
            this.currentType = cat.type;

            title.textContent = cat.type === 'expense' ? 'Editar Gasto' : 'Editar Ingreso';
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (submitBtn) submitBtn.textContent = 'Guardar';

            accSelect.innerHTML = State.db.accounts.map(a => `<option value="${a.id}">${a.name} (${a.currency})</option>`).join('');
            catSelect.innerHTML = State.db.categories.filter(c => c.type === cat.type).map(c => `<option value="${c.id}">${c.name}</option>`).join('');

            document.getElementById('tx-id').value = tx.id;
            document.getElementById('tx-date').value = tx.date;
            accSelect.value = tx.account_id;
            document.getElementById('tx-amount').value = tx.amount;
            catSelect.value = tx.category_id;
            document.getElementById('tx-notes').value = tx.notes || '';

            modal.classList.remove('hidden');
        }
    },

    // --- MODALES DE CONFIGURACIÓN ---

    openAccountModal(id = null) {
        const modal = document.getElementById('account-modal');
        const form = document.getElementById('account-form');
        let selectedColor = '#DFB574'; // Color por defecto
        
        if (id) {
            const acc = State.db.accounts.find(a => String(a.id) === String(id));
            form['acc-id'].value = acc.id;
            form['acc-name'].value = acc.name;
            form['acc-currency'].value = acc.currency;
            form['acc-type'].value = acc.type;
            form['acc-balance'].value = acc.balance;
            form['acc-color'].value = acc.color;
            selectedColor = acc.color;
        } else {
            form.reset();
            form['acc-id'].value = '';
            form['acc-color'].value = selectedColor;
        }

        // Actualizar clase selected en la cuadrícula de colores
        const colorSelector = document.getElementById('acc-color-selector');
        if (colorSelector) {
            colorSelector.querySelectorAll('.color-swatch').forEach(s => {
                if (s.dataset.color === selectedColor) s.classList.add('selected');
                else s.classList.remove('selected');
            });
        }

        modal.classList.remove('hidden');
    },

    openCategoryModal(id = null) {
        const modal = document.getElementById('category-modal');
        const form = document.getElementById('category-form');
        let selectedColor = '#6B8E9B'; // Color por defecto
        let selectedIcon = 'fa-tag';   // Icono por defecto

        if (id) {
            const cat = State.db.categories.find(c => String(c.id) === String(id));
            form['cat-id'].value = cat.id;
            form['cat-name'].value = cat.name;
            form['cat-type'].value = cat.type;
            form['cat-icon'].value = cat.icon;
            form['cat-color'].value = cat.visual_color;
            selectedColor = cat.visual_color;
            selectedIcon = cat.icon;
        } else {
            form.reset();
            form['cat-id'].value = '';
            form['cat-color'].value = selectedColor;
            form['cat-icon'].value = selectedIcon;
        }

        // Actualizar clase selected en la cuadrícula de colores
        const colorSelector = document.getElementById('cat-color-selector');
        if (colorSelector) {
            colorSelector.querySelectorAll('.color-swatch').forEach(s => {
                if (s.dataset.color === selectedColor) s.classList.add('selected');
                else s.classList.remove('selected');
            });
        }

        // Actualizar clase selected en la cuadrícula de iconos
        const iconSelector = document.getElementById('cat-icon-selector');
        if (iconSelector) {
            iconSelector.querySelectorAll('i').forEach(i => {
                if (i.dataset.icon === selectedIcon) i.classList.add('selected');
                else i.classList.remove('selected');
            });
        }

        modal.classList.remove('hidden');
    },

    // --- MODALES DE METAS (FUTUROS) ---

    openGoalModal(id = null) {
        const modal = document.getElementById('goal-modal');
        const form = document.getElementById('goal-form');
        const accSelect = document.getElementById('goal-account');

        accSelect.innerHTML = '<option value="">Ninguna (Fondo Independiente)</option>' + 
            State.db.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

        if (id) {
            const goal = State.db.goals.find(g => String(g.id) === String(id));
            form['goal-id'].value = goal.id;
            form['goal-name'].value = goal.name;
            form['goal-target'].value = goal.target;
            form['goal-account'].value = goal.account_id || '';
            form['goal-icon'].value = goal.icon;
        } else {
            form.reset();
            form['goal-id'].value = '';
        }
        modal.classList.remove('hidden');
    },

    openFundGoalModal(id) {
        const modal = document.getElementById('fund-goal-modal');
        const form = document.getElementById('fund-goal-form');
        form['fund-goal-id'].value = id;
        modal.classList.remove('hidden');
    },

    // --- MANEJADORES DE SUBMIT ---

    handleTransactionSubmit(e) {
        e.preventDefault();
        const f = e.target;
        const amount = parseFloat(f['tx-amount'].value);
        const accountId = f['tx-account'].value;
        const txId = f['tx-id'].value;
        const transaction = {
            date: f['tx-date'].value,
            account_id: accountId,
            category_id: f['tx-category'].value,
            amount: amount,
            notes: f['tx-notes'].value,
            type: 'standard'
        };
        if (txId) {
            State.updateTransaction(txId, transaction);
        } else {
            State.addTransaction(transaction);
            State.updateAccountBalance(accountId, this.currentType === 'expense' ? -amount : amount);
        }
        this.hideModal('transaction-modal');
    },

    handleTransferSubmit(e) {
        e.preventDefault();
        const f = e.target;
        const amount = parseFloat(f['trans-amount'].value);
        const fee = parseFloat(f['trans-fee']?.value || 0) || 0; // Comisión bancaria (por defecto 0)
        const fromId = f['trans-from'].value;
        const toId = f['trans-to'].value;
        const transId = f['trans-id'].value;
        if (fromId === toId) return alert("Cuentas idénticas");
        
        const fromAccount = State.db.accounts.find(a => String(a.id) === String(fromId));
        const toAccount = State.db.accounts.find(a => String(a.id) === String(toId));
        
        if (!fromAccount || !toAccount) return alert("Error al encontrar las cuentas");
        
        const rates = State.db.settings.exchangeRates || {};
        const rateFrom = rates[fromAccount.currency] || 1;
        const rateTo = rates[toAccount.currency] || 1;
        
        // El destino recibe solo el monto enviado (sin comisión), convertido a su divisa
        const amountReceived = amount * (rateTo / rateFrom);
        // El origen pierde: monto enviado + comisión (ambos en la divisa del origen)
        const totalExtracted = amount + fee;
        
        const txData = {
            type: 'transfer', 
            date: f['trans-date'].value,
            from_account_id: fromId, 
            to_account_id: toId,
            amount_extracted: totalExtracted,  // Lo que sale del origen (incluye comisión)
            amount_received: amountReceived,    // Lo que llega al destino (sin comisión)
            fee: fee,                           // Guardamos la comisión para auditoría
            notes: fee > 0 
                ? `Transferencia interna (comisión: ${fee.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${fromAccount.currency})`
                : 'Transferencia interna'
        };

        if (transId) {
            State.updateTransaction(transId, txData);
        } else {
            State.addTransaction(txData);
            State.updateAccountBalance(fromId, -totalExtracted);  // Descuenta monto + comisión del origen
            State.updateAccountBalance(toId, amountReceived);     // Acredita solo el monto al destino
        }
        this.hideModal('transfer-modal');
    },

    handleTransactionDelete() {
        const id = document.getElementById('tx-id').value;
        if (!id) return;
        
        if (confirm("¿Estás seguro de que deseas eliminar permanentemente este movimiento?")) {
            State.deleteTransaction(id);
            this.hideModal('transaction-modal');
        }
    },

    handleTransferDelete() {
        const id = document.getElementById('trans-id').value;
        if (!id) return;
        
        if (confirm("¿Estás seguro de que deseas eliminar permanentemente esta transferencia?")) {
            State.deleteTransaction(id);
            this.hideModal('transfer-modal');
        }
    },

    handleAccountSubmit(e) {
        e.preventDefault();
        const f = e.target;
        const data = { name: f['acc-name'].value, currency: f['acc-currency'].value, type: f['acc-type'].value, balance: parseFloat(f['acc-balance'].value), color: f['acc-color'].value };
        if (f['acc-id'].value) State.updateAccount(f['acc-id'].value, data);
        else State.addAccount(data);
        this.hideModal('account-modal');
    },

    handleCategorySubmit(e) {
        e.preventDefault();
        const f = e.target;
        const data = { name: f['cat-name'].value, type: f['cat-type'].value, icon: f['cat-icon'].value, visual_color: f['cat-color'].value };
        if (f['cat-id'].value) State.updateCategory(f['cat-id'].value, data);
        else State.addCategory(data);
        this.hideModal('category-modal');
    },

    handleGoalSubmit(e) {
        e.preventDefault();
        const f = e.target;
        const data = { name: f['goal-name'].value, target: parseFloat(f['goal-target'].value), account_id: f['goal-account'].value || null, icon: f['goal-icon'].value };
        if (f['goal-id'].value) State.updateGoal(f['goal-id'].value, data);
        else State.addGoal(data);
        this.hideModal('goal-modal');
    },

    handleFundGoalSubmit(e) {
        e.preventDefault();
        const f = e.target;
        State.fundGoal(f['fund-goal-id'].value, parseFloat(f['fund-amount'].value));
        this.hideModal('fund-goal-modal');
    },

    openProfileManager() {
        UI.renderProfilesList();
        const modal = document.getElementById('profile-manager-modal');
        if (modal) modal.classList.remove('hidden');
    },

    openProfileEditModal(id = null) {
        const modal = document.getElementById('profile-edit-modal');
        const form = document.getElementById('profile-edit-form');
        const title = document.getElementById('modal-title-profile');
        const deleteBtn = document.getElementById('profile-delete-btn');

        if (!modal || !form) return;

        // Ocultar modal del manager primero si está abierto
        this.hideModal('profile-manager-modal');

        if (id) {
            title.textContent = "Editar Perfil";
            const p = State.profilesState.profiles.find(x => String(x.id) === String(id));
            if (p) {
                form['profile-edit-id'].value = p.id;
                form['profile-name'].value = p.name;
                form['profile-color'].value = p.color;
                form['profile-icon'].value = p.icon;
                
                // Actualizar clases selected en colores del modal de perfiles
                const colorSelector = document.getElementById('profile-color-selector');
                if (colorSelector) {
                    colorSelector.querySelectorAll('.color-swatch').forEach(s => {
                        if (s.dataset.color === p.color) s.classList.add('selected');
                        else s.classList.remove('selected');
                    });
                }

                // Actualizar clases selected en iconos
                const iconSelector = document.getElementById('profile-icon-selector');
                if (iconSelector) {
                    iconSelector.querySelectorAll('i').forEach(i => {
                        if (i.dataset.icon === p.icon) i.classList.add('selected');
                        else i.classList.remove('selected');
                    });
                }
            }
            if (deleteBtn) deleteBtn.classList.remove('hidden');
        } else {
            title.textContent = "Nuevo Perfil";
            form.reset();
            form['profile-edit-id'].value = '';
            form['profile-color'].value = '#8C9970';
            form['profile-icon'].value = 'fa-user';

            // Resetear visual selectors
            const colorSelector = document.getElementById('profile-color-selector');
            if (colorSelector) {
                colorSelector.querySelectorAll('.color-swatch').forEach(s => {
                    if (s.dataset.color === '#8C9970') s.classList.add('selected');
                    else s.classList.remove('selected');
                });
            }
            const iconSelector = document.getElementById('profile-icon-selector');
            if (iconSelector) {
                iconSelector.querySelectorAll('i').forEach(i => {
                    if (i.dataset.icon === 'fa-user') i.classList.add('selected');
                    else i.classList.remove('selected');
                });
            }

            if (deleteBtn) deleteBtn.classList.add('hidden');
        }
        modal.classList.remove('hidden');
    },

    async handleProfileSubmit(e) {
        e.preventDefault();
        const f = e.target;
        const id = f['profile-edit-id'].value;
        const name = f['profile-name'].value;
        const color = f['profile-color'].value;
        const icon = f['profile-icon'].value;

        if (id) {
            await State.updateProfile(id, name, color, icon);
        } else {
            await State.addProfile(name, color, icon);
        }
        this.hideModal('profile-edit-modal');
    },

    async handleProfileDelete() {
        const id = document.getElementById('profile-edit-id').value;
        if (!id) return;

        const p = State.profilesState.profiles.find(x => String(x.id) === String(id));
        if (!p) return;

        if (State.profilesState.profiles.length <= 1) {
            alert("No puedes eliminar el único perfil disponible.");
            return;
        }

        const conf = prompt(`Para eliminar permanentemente el perfil "${p.name}" y todo su historial financiero, escribe la palabra "ELIMINAR" en mayúsculas:`);
        if (conf === 'ELIMINAR') {
            await State.deleteProfile(id);
            this.hideModal('profile-edit-modal');
        }
    },

    hideModal(id) {
        document.getElementById(id).classList.add('hidden');
    }
};
