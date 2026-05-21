import { State } from './state.js';

export function getLocalDateComponents(dateStr) {
    if (!dateStr) return null;
    const onlyDate = String(dateStr).split(/[T ]/)[0]; 
    
    // Intentar con guiones YYYY-MM-DD o DD-MM-YYYY
    let parts = onlyDate.split('-');
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return {
                year: parseInt(parts[0], 10),
                month: parseInt(parts[1], 10) - 1,
                day: parseInt(parts[2], 10)
            };
        } else if (parts[2].length === 4) {
            return {
                year: parseInt(parts[2], 10),
                month: parseInt(parts[1], 10) - 1,
                day: parseInt(parts[0], 10)
            };
        }
    }
    
    // Intentar con slashes YYYY/MM/DD o DD/MM/YYYY
    parts = onlyDate.split('/');
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return {
                year: parseInt(parts[0], 10),
                month: parseInt(parts[1], 10) - 1,
                day: parseInt(parts[2], 10)
            };
        } else if (parts[2].length === 4) {
            return {
                year: parseInt(parts[2], 10),
                month: parseInt(parts[1], 10) - 1,
                day: parseInt(parts[0], 10)
            };
        }
    }
    
    // Fallback: usar new Date() estándar
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return {
            year: d.getFullYear(),
            month: d.getMonth(),
            day: d.getDate()
        };
    }
    
    return null;
}

export function standardizeDate(dateStr) {
    const comp = getLocalDateComponents(dateStr);
    if (!comp) return 'Fecha desconocida';
    const yyyy = comp.year;
    const mm = String(comp.month + 1).padStart(2, '0');
    const dd = String(comp.day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function isDarkColor(hex) {
    if (!hex) return false;
    const c = hex.replace('#', '');
    let r, g, b;
    if (c.length === 3) {
        r = parseInt(c[0] + c[0], 16);
        g = parseInt(c[1] + c[1], 16);
        b = parseInt(c[2] + c[2], 16);
    } else if (c.length === 6) {
        r = parseInt(c.substring(0, 2), 16);
        g = parseInt(c.substring(2, 4), 16);
        b = parseInt(c.substring(4, 6), 16);
    } else {
        return false;
    }
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq < 140;
}

export const UI = {
    showAllTransactions: false,
    currentHistoryAccountId: null,
    elements: {
        totalNetWorth: document.getElementById('total-net-worth'),
        totalAssets: document.getElementById('total-assets'),
        totalLiabilities: document.getElementById('total-liabilities'),
        accountsCarousel: document.getElementById('accounts-carousel'),
        transactionsList: document.getElementById('transactions-list'),
        exchangeRates: document.getElementById('settings-exchange-rates')
    },

    init() {
        State.subscribe(() => this.renderAll());
        
        const seeAllBtn = document.querySelector('.see-all');
        if (seeAllBtn) {
            seeAllBtn.style.cursor = 'pointer';
            seeAllBtn.addEventListener('click', () => {
                this.showAllTransactions = !this.showAllTransactions;
                this.renderTransactions();
            });
        }
        
        this.renderAll();
    },

    renderAll() {
        this.renderGreeting();
        this.renderNetWorth();
        this.renderAccounts();
        this.renderTransactions();
        this.renderExchangeRates();
        this.renderSavings();
        this.renderCategories();

        // Refrescar el historial del modal de la cuenta si está abierto
        const modal = document.getElementById('account-history-modal');
        if (modal && !modal.classList.contains('hidden') && this.currentHistoryAccountId) {
            this.renderAccountHistoryTransactions();
            const acc = State.db.accounts.find(a => String(a.id) === String(this.currentHistoryAccountId));
            if (acc) {
                const cardBalanceEl = document.getElementById('acc-history-card-balance');
                if (cardBalanceEl) {
                    cardBalanceEl.textContent = `$${acc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
                }
            }
        }
    },

    renderGreeting() {
        const greeting = document.getElementById('profile-greeting');
        if (greeting && State.activeProfile) {
            greeting.innerHTML = `
                <i class="fas ${State.activeProfile.icon}" style="color: ${State.activeProfile.color}; margin-right: 8px;"></i>
                ${State.activeProfile.name} 
                <i class="fas fa-caret-down" style="font-size: 0.8rem; margin-left: 5px; opacity: 0.7;"></i>
            `;
        }
    },

    renderNetWorth() {
        const { accounts, settings } = State.db;
        let assets = 0;
        let liabilities = 0;

        accounts.forEach(acc => {
            const rate = settings.exchangeRates[acc.currency];
            const safeRate = (rate && rate > 0) ? rate : 1;
            const balanceInBase = acc.balance / safeRate;
            if (acc.type === 'asset') assets += balanceInBase;
            else liabilities += Math.abs(balanceInBase);
        });

        const netWorth = assets - liabilities;
        
        if (this.elements.totalNetWorth) {
            this.elements.totalNetWorth.textContent = `$${netWorth.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        }
        if (this.elements.totalAssets) {
            this.elements.totalAssets.textContent = `$${assets.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        }
        if (this.elements.totalLiabilities) {
            this.elements.totalLiabilities.textContent = `$${liabilities.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        }
    },

    renderAccounts() {
        // 1. Renderizar Carrusel (Home)
        if (this.elements.accountsCarousel) {
            const { accounts } = State.db;
            this.elements.accountsCarousel.innerHTML = accounts.map(acc => {
                const isDark = isDarkColor(acc.color);
                return `
                    <div class="account-card ${isDark ? 'is-dark' : ''} account-card-trigger" data-id="${acc.id}" style="background: ${acc.color || 'var(--accent-gold)'}; cursor: pointer;">
                        <div class="ac-bg-lines"><i class="fa-solid fa-wallet"></i></div>
                        <div class="acc-info">
                            <span class="acc-name">${acc.name}</span>
                            <span class="acc-currency">${acc.currency}</span>
                        </div>
                        <div class="acc-balance">$${acc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                    </div>
                `;
            }).join('');

            // Adjuntar event listeners para abrir el historial de la cuenta al hacer clic
            this.elements.accountsCarousel.querySelectorAll('.account-card-trigger').forEach(card => {
                card.onclick = () => {
                    const accId = card.dataset.id;
                    this.openAccountHistoryModal(accId);
                };
            });
        }

        // 2. Renderizar Lista en Configuración
        const settingsAccounts = document.getElementById('settings-accounts');
        if (settingsAccounts) {
            settingsAccounts.innerHTML = State.db.accounts.map((acc, index, arr) => `
                <div class="setting-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background: ${acc.color}"></div>
                        <span><strong>${acc.name}</strong> (${acc.currency})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        ${index > 0 ? `
                            <button class="btn-icon move-acc-up" data-id="${acc.id}" title="Subir orden">
                                <i class="fas fa-chevron-up" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                            </button>
                        ` : '<div style="width: 26px;"></div>'}
                        ${index < arr.length - 1 ? `
                            <button class="btn-icon move-acc-down" data-id="${acc.id}" title="Bajar orden">
                                <i class="fas fa-chevron-down" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                            </button>
                        ` : '<div style="width: 26px;"></div>'}
                        <button class="btn-icon" onclick="FormService.openAccountModal('${acc.id}')" title="Editar">
                            <i class="fas fa-pencil-alt" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            // Adjuntar event listeners
            settingsAccounts.querySelectorAll('.move-acc-up').forEach(btn => {
                btn.onclick = () => {
                    State.moveAccount(btn.dataset.id, 'up');
                };
            });
            settingsAccounts.querySelectorAll('.move-acc-down').forEach(btn => {
                btn.onclick = () => {
                    State.moveAccount(btn.dataset.id, 'down');
                };
            });
        }
    },

    renderCategories() {
        const settingsCategories = document.getElementById('settings-categories');
        if (settingsCategories && State.db) {
            const categories = State.db.categories;
            const incomes = categories.filter(c => c.type === 'income');
            const expenses = categories.filter(c => c.type === 'expense');

            const makeCategoryRowHtml = (cat, index, arr) => {
                return `
                    <div class="setting-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="t-icon" style="background-color: ${cat.visual_color}; width: 25px; height: 25px; font-size: 0.7rem;">
                                <i class="fa-solid ${cat.icon.startsWith('fa-') ? cat.icon : 'fa-' + cat.icon}"></i>
                            </div>
                            <span><strong>${cat.name}</strong></span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            ${index > 0 ? `
                                <button class="btn-icon move-cat-up" data-id="${cat.id}" title="Subir orden">
                                    <i class="fas fa-chevron-up" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                                </button>
                            ` : '<div style="width: 26px;"></div>'}
                            ${index < arr.length - 1 ? `
                                <button class="btn-icon move-cat-down" data-id="${cat.id}" title="Bajar orden">
                                    <i class="fas fa-chevron-down" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                                </button>
                            ` : '<div style="width: 26px;"></div>'}
                            <button class="btn-icon" onclick="FormService.openCategoryModal('${cat.id}')" title="Editar">
                                <i class="fas fa-pencil-alt" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                            </button>
                        </div>
                    </div>
                `;
            };

            const incomesHtml = incomes.length > 0
                ? incomes.map((cat, index) => makeCategoryRowHtml(cat, index, incomes)).join('')
                : '<div style="padding: 10px 0; opacity: 0.5; font-style: italic; font-size: 0.9rem;">No hay categorías de ingresos</div>';

            const expensesHtml = expenses.length > 0
                ? expenses.map((cat, index) => makeCategoryRowHtml(cat, index, expenses)).join('')
                : '<div style="padding: 10px 0; opacity: 0.5; font-style: italic; font-size: 0.9rem;">No hay categorías de gastos</div>';

            settingsCategories.innerHTML = `
                <div class="category-group-header" style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; color: var(--action-income); margin: 5px 0 8px 0; border-bottom: 2px dashed rgba(0, 95, 86, 0.2); padding-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-arrow-down" style="font-size: 0.95rem;"></i> Ingresos
                </div>
                <div class="category-group-list">
                    ${incomesHtml}
                </div>
                
                <div class="category-group-header" style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; color: var(--action-expense); margin: 20px 0 8px 0; border-bottom: 2px dashed rgba(178, 58, 30, 0.2); padding-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-arrow-up" style="font-size: 0.95rem;"></i> Gastos
                </div>
                <div class="category-group-list">
                    ${expensesHtml}
                </div>
            `;

            // Adjuntar event listeners
            settingsCategories.querySelectorAll('.move-cat-up').forEach(btn => {
                btn.onclick = () => {
                    State.moveCategory(btn.dataset.id, 'up');
                };
            });
            settingsCategories.querySelectorAll('.move-cat-down').forEach(btn => {
                btn.onclick = () => {
                    State.moveCategory(btn.dataset.id, 'down');
                };
            });
        }
    },

    renderTransactions() {
        if (!this.elements.transactionsList) return;
        const { transactions, categories, accounts } = State.db;
        
        if (transactions.length === 0) {
            this.elements.transactionsList.innerHTML = '<div class="empty-state">No hay movimientos recientes</div>';
            return;
        }
        
        // Actualizar el texto del botón "Ver todo" dinámicamente
        const seeAllBtn = document.querySelector('.see-all');
        if (seeAllBtn) {
            seeAllBtn.textContent = this.showAllTransactions ? 'Ver menos' : 'Ver todo';
        }
        
        // Ordenar transacciones cronológicamente (más recientes primero)
        const sortedTx = [...transactions].sort((a, b) => {
            const dateA = standardizeDate(a.date);
            const dateB = standardizeDate(b.date);
            const dateComp = dateB.localeCompare(dateA);
            if (dateComp !== 0) return dateComp;
            return (parseFloat(b.id) || 0) - (parseFloat(a.id) || 0);
        });

        // Determinar límite e historial completo
        const limit = this.showAllTransactions ? sortedTx.length : 20;
        const txsToRender = sortedTx.slice(0, limit);

        // Agrupar por fecha estandarizada YYYY-MM-DD
        const groups = {};
        txsToRender.forEach(tx => {
            const dateStr = standardizeDate(tx.date);
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(tx);
        });

        let html = '';
        Object.entries(groups).forEach(([dateStr, txs]) => {
            let formattedGroupDate = dateStr;
            if (dateStr !== 'Fecha desconocida') {
                try {
                    const parts = dateStr.split('-');
                    if (parts.length === 3) {
                        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                        formattedGroupDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                        formattedGroupDate = formattedGroupDate.charAt(0).toUpperCase() + formattedGroupDate.slice(1);
                    }
                } catch (e) {
                    console.error(e);
                }

                // Obtener fecha local de hoy y ayer
                const getLocalDateStr = (d) => {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}`;
                };

                const todayStr = getLocalDateStr(new Date());
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = getLocalDateStr(yesterday);

                if (dateStr === todayStr) {
                    formattedGroupDate = 'Hoy';
                } else if (dateStr === yesterdayStr) {
                    formattedGroupDate = 'Ayer';
                }
            } else {
                formattedGroupDate = 'Fecha desconocida';
            }

            const itemsHtml = txs.map(tx => {
                // Caso especial para Transferencias
                if (tx.type === 'transfer') {
                    const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id)) || { name: 'Cuenta Origen', currency: '' };
                    const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id)) || { name: 'Cuenta Destino', currency: '' };

                    return `
                        <div class="transaction-item edit-tx-trigger" data-id="${tx.id}" style="border-left: 4px solid var(--accent-gold); cursor: pointer;">
                            <div class="t-info">
                                <div class="t-icon" style="background-color: var(--accent-gold); color: #fff;">
                                    <i class="fa-solid fa-exchange-alt"></i>
                                </div>
                                <div class="t-text">
                                    <span class="t-name">Transferencia interna</span>
                                    <span class="t-date">${fromAcc.name} ➜ ${toAcc.name}</span>
                                    ${parseFloat(tx.fee || 0) > 0 ? `<span style="font-size:0.75rem; color:#C1773A; font-style:italic;"><i class="fas fa-receipt" style="margin-right:3px;"></i>Comisión: ${parseFloat(tx.fee).toFixed(2)} ${fromAcc.currency}</span>` : ''}
                                </div>
                            </div>
                            <div style="text-align: right; line-height: 1.2;">
                                <span class="amount-expense" style="font-size: 0.95rem; font-weight: 700;">-${parseFloat(tx.amount_extracted || 0).toFixed(2)} ${fromAcc.currency}</span>
                                <br>
                                <span class="amount-income" style="font-size: 0.85rem; font-weight: 700; opacity: 0.8;">+${parseFloat(tx.amount_received || 0).toFixed(2)} ${toAcc.currency}</span>
                            </div>
                        </div>
                    `;
                }

                const cat = categories.find(c => String(c.id) === String(tx.category_id)) || { icon: 'fa-tag', visual_color: '#ccc', name: 'Otros', type: 'expense' };
                const acc = accounts.find(a => String(a.id) === String(tx.account_id)) || { name: 'Cuenta', currency: '' };
                const amountSign = cat.type === 'expense' ? '-' : '+';
                const amountClass = cat.type === 'expense' ? 'amount-expense' : 'amount-income';
                
                let iconClass = cat.icon || 'fa-tag';
                if (!iconClass.startsWith('fa-')) iconClass = 'fa-' + iconClass;

                return `
                    <div class="transaction-item edit-tx-trigger" data-id="${tx.id}" style="border-left: 4px solid ${cat.visual_color || '#ccc'}; cursor: pointer;">
                        <div class="t-info">
                            <div class="t-icon" style="background-color: ${cat.visual_color}">
                                <i class="fa-solid ${iconClass}"></i>
                            </div>
                            <div class="t-text">
                                <span class="t-name">${cat.name}</span>
                                <span class="t-date"><strong style="color: var(--text-primary); font-weight: 700;">${acc.name}</strong>${tx.notes ? ' &bull; ' + tx.notes : ''}</span>
                            </div>
                        </div>
                        <div class="t-amount ${amountClass}">${amountSign}$${parseFloat(tx.amount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                `;
            }).join('');

            html += `
                <div class="transaction-group">
                    <div class="transaction-group-header">${formattedGroupDate}</div>
                    <div class="transaction-group-items">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        });

        this.elements.transactionsList.innerHTML = html;

        // Añadir event listeners para edición al hacer clic en las transacciones
        this.elements.transactionsList.querySelectorAll('.edit-tx-trigger').forEach(item => {
            item.addEventListener('click', () => {
                const txId = item.dataset.id;
                if (window.FormService) {
                    window.FormService.openTransactionEditModal(txId);
                }
            });
        });
    },

    renderExchangeRates() {
        if (!this.elements.exchangeRates) return;
        const { exchangeRates, baseCurrency } = State.db.settings;

        const options = ['USD', 'EUR', 'COP', 'RUB'].map(curr => 
            `<option value="${curr}" ${curr === baseCurrency ? 'selected' : ''}>${curr}</option>`
        ).join('');

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-size: 0.95rem; color: var(--text-primary); font-weight: 700; font-family: var(--font-heading);">Moneda Base:</span>
                <select id="base-currency-select" class="filter-select" style="padding: 4px 8px; font-size: 0.9rem; background: var(--bg-card); border: 2px solid var(--text-primary); border-radius: 4px; font-family: var(--font-body); font-weight: 700; cursor: pointer; max-width: 100px;">
                    ${options}
                </select>
            </div>
        `;
        
        Object.entries(exchangeRates).forEach(([currency, rate]) => {
            if (currency === baseCurrency) return;
            // Mostrar hasta 6 decimales para tasas muy pequeñas (ej. COP a USD/EUR)
            const formattedRate = rate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
            html += `
                <div class="setting-row" style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 0.9rem;">
                    <span><strong>1 ${baseCurrency}</strong> =</span>
                    <span>${formattedRate} ${currency}</span>
                </div>
            `;
        });

        this.elements.exchangeRates.innerHTML = html;

        // Adjuntar event listener para cambio de moneda base
        const select = document.getElementById('base-currency-select');
        if (select) {
            select.addEventListener('change', (e) => {
                const newBase = e.target.value;
                State.updateBaseCurrency(newBase);
            });
        }
    },

    renderSavings() {
        // 1. Renderizar en Home
        const homeList = document.getElementById('savings-list');
        const { goals, accounts } = State.db;

        if (homeList) {
            if (goals.length === 0) {
                homeList.innerHTML = '<div class="empty-state">No hay metas de ahorro activas</div>';
            } else {
                homeList.innerHTML = goals.map(g => {
                    const current = g.account_id ? (accounts.find(a => String(a.id) === String(g.account_id))?.balance || 0) : (g.current || 0);
                    const percent = Math.min(100, Math.round((current / g.target) * 100)) || 0;
                    
                    return `
                        <div class="saving-card" onclick="FormService.openGoalModal('${g.id}')">
                            <div class="saving-header">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div class="t-icon" style="background-color: var(--bg-secondary); color: var(--text-primary);">
                                        <i class="fa-solid ${g.icon.startsWith('fa-') ? g.icon : 'fa-' + g.icon}"></i>
                                    </div>
                                    <div class="saving-info">
                                        <h4>${g.name} ${g.account_id ? '<i class="fas fa-link" style="font-size: 0.6rem; opacity: 0.5;"></i>' : ''}</h4>
                                        <p>$${current.toLocaleString('es-ES')} / $${g.target.toLocaleString('es-ES')}</p>
                                    </div>
                                </div>
                                <button class="saving-progress-btn" onclick="event.stopPropagation(); ${g.account_id ? `FormService.openTransferModal(null, '${g.account_id}')` : `FormService.openFundGoalModal('${g.id}')`}">
                                    <i class="fas ${g.account_id ? 'fa-exchange-alt' : 'fa-plus'}"></i>
                                </button>
                            </div>
                            <div class="saving-progress-container">
                                <div class="saving-progress-bar-wrap">
                                    <div class="saving-progress-bar" style="width: ${percent}%; background: var(--accent-gold);"></div>
                                </div>
                                <div class="saving-meta">
                                    <span>Progreso</span>
                                    <span>${percent}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // 2. Renderizar en Configuración
        const settingsGoals = document.getElementById('settings-goals');
        if (settingsGoals) {
            settingsGoals.innerHTML = goals.map((g, index, arr) => `
                <div class="setting-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="t-icon" style="background-color: var(--bg-secondary); width: 25px; height: 25px; font-size: 0.7rem;">
                            <i class="fa-solid ${g.icon.startsWith('fa-') ? g.icon : 'fa-' + g.icon}"></i>
                        </div>
                        <span><strong>${g.name}</strong> <small style="opacity:0.6">$${g.target.toLocaleString('es-ES')}</small></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        ${index > 0 ? `
                            <button class="btn-icon move-goal-up" data-id="${g.id}" title="Subir orden">
                                <i class="fas fa-chevron-up" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                            </button>
                        ` : '<div style="width: 26px;"></div>'}
                        ${index < arr.length - 1 ? `
                            <button class="btn-icon move-goal-down" data-id="${g.id}" title="Bajar orden">
                                <i class="fas fa-chevron-down" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                            </button>
                        ` : '<div style="width: 26px;"></div>'}
                        <button class="btn-icon" onclick="FormService.openGoalModal('${g.id}')" title="Editar">
                            <i class="fas fa-pencil-alt" style="font-size: 0.8rem; color: var(--text-secondary);"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            // Adjuntar event listeners
            settingsGoals.querySelectorAll('.move-goal-up').forEach(btn => {
                btn.onclick = () => {
                    State.moveGoal(btn.dataset.id, 'up');
                };
            });
            settingsGoals.querySelectorAll('.move-goal-down').forEach(btn => {
                btn.onclick = () => {
                    State.moveGoal(btn.dataset.id, 'down');
                };
            });
        }
    },

    renderProfilesList() {
        const container = document.getElementById('profiles-list');
        if (!container || !State.profilesState) return;

        const { profiles, activeProfileId } = State.profilesState;

        container.innerHTML = profiles.map(p => {
            const isActive = String(p.id) === String(activeProfileId);
            return `
                <div class="transaction-item profile-item" data-id="${p.id}" style="border-left: 6px solid ${p.color}; cursor: pointer; margin-bottom: 12px;">
                    <div class="t-info" style="display: flex; align-items: center; gap: 15px;">
                        <div class="t-icon" style="background-color: ${p.color}; color: #fff; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--text-primary); box-shadow: 1px 1px 0px var(--text-primary);">
                            <i class="fas ${p.icon}"></i>
                        </div>
                        <div class="t-text" style="display: flex; flex-direction: column;">
                            <span class="t-name" style="font-weight: 700; font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-primary);">${p.name}</span>
                            <span class="t-date" style="font-size: 0.8rem; opacity: 0.8; color: var(--text-secondary);">${isActive ? '<strong>Perfil Activo</strong>' : 'Hacer clic para cambiar'}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${isActive ? '<span class="ac-currency" style="margin: 0; font-size: 0.75rem; background: var(--action-income); border: 1.5px solid var(--text-primary); color: #fff;">ACTIVO</span>' : ''}
                        <button class="btn-icon edit-profile-btn" data-id="${p.id}" style="font-size: 1.1rem; padding: 5px; color: var(--text-primary); cursor: pointer;">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Agregar listeners
        container.querySelectorAll('.profile-item').forEach(item => {
            const id = item.dataset.id;
            
            // Clic en la tarjeta de perfil (cambiar perfil)
            item.addEventListener('click', (e) => {
                // Si el clic es en el botón de edición o dentro de él, no cambiar de perfil
                if (e.target.closest('.edit-profile-btn')) return;
                
                State.switchProfile(id);
            });

            // Clic en el botón de editar perfil
            const editBtn = item.querySelector('.edit-profile-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Evitar que el clic en el botón active el cambio de perfil
                    if (window.FormService) {
                        window.FormService.openProfileEditModal(id);
                    }
                });
            }
        });
    },

    openAccountHistoryModal(accId) {
        this.currentHistoryAccountId = accId;
        const acc = State.db.accounts.find(a => String(a.id) === String(accId));
        if (!acc) return;

        // Inyectar info
        const cardNameEl = document.getElementById('acc-history-card-name');
        const cardCurrencyEl = document.getElementById('acc-history-card-currency');
        const cardBalanceEl = document.getElementById('acc-history-card-balance');
        const infoCardEl = document.getElementById('acc-history-info-card');

        if (cardNameEl) cardNameEl.textContent = acc.name;
        if (cardCurrencyEl) cardCurrencyEl.textContent = acc.currency;
        if (cardBalanceEl) {
            cardBalanceEl.textContent = `$${acc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        }
        if (infoCardEl) {
            infoCardEl.style.backgroundColor = acc.color || 'var(--bg-secondary)';
            // Ajustar el color del texto según la luminosidad del color de la tarjeta
            const isDark = isDarkColor(acc.color);
            if (isDark) {
                cardNameEl.style.color = '#FFF';
                cardCurrencyEl.style.color = '#FFF';
                cardBalanceEl.style.color = '#FFF';
                cardCurrencyEl.style.borderColor = '#FFF';
                cardCurrencyEl.style.backgroundColor = 'rgba(255,255,255,0.15)';
            } else {
                cardNameEl.style.color = 'var(--text-primary)';
                cardCurrencyEl.style.color = 'var(--text-primary)';
                cardBalanceEl.style.color = 'var(--text-primary)';
                cardCurrencyEl.style.borderColor = 'var(--text-primary)';
                cardCurrencyEl.style.backgroundColor = 'rgba(0,0,0,0.05)';
            }
        }

        // Resetear selectores a "all"
        const timeFilter = document.getElementById('acc-history-time-filter');
        const typeFilter = document.getElementById('acc-history-type-filter');
        if (timeFilter) timeFilter.value = 'all';
        if (typeFilter) typeFilter.value = 'all';

        // Vincular change events
        if (timeFilter) {
            timeFilter.onchange = () => this.renderAccountHistoryTransactions();
        }
        if (typeFilter) {
            typeFilter.onchange = () => this.renderAccountHistoryTransactions();
        }

        const modal = document.getElementById('account-history-modal');
        if (modal) modal.classList.remove('hidden');

        this.renderAccountHistoryTransactions();
    },

    renderAccountHistoryTransactions() {
        const accId = this.currentHistoryAccountId;
        if (!accId) return;

        const listContainer = document.getElementById('account-history-list');
        if (!listContainer) return;

        const { transactions, categories, accounts } = State.db;
        const acc = accounts.find(a => String(a.id) === String(accId));
        if (!acc) return;

        // 1. Filtrar por cuenta (transacciones directas y transferencias de entrada/salida)
        let filteredTx = transactions.filter(tx => {
            if (tx.type === 'transfer') {
                return String(tx.from_account_id) === String(accId) || String(tx.to_account_id) === String(accId);
            }
            return String(tx.account_id) === String(accId);
        });

        // 2. Filtrar por rango temporal
        const timeFilter = document.getElementById('acc-history-time-filter')?.value || 'all';
        const now = new Date();
        let cutoffDate = null;

        if (timeFilter === 'week') {
            cutoffDate = new Date(); cutoffDate.setDate(now.getDate() - 7);
        } else if (timeFilter === 'month') {
            cutoffDate = new Date(); cutoffDate.setDate(now.getDate() - 30);
        } else if (timeFilter === '3months') {
            cutoffDate = new Date(); cutoffDate.setDate(now.getDate() - 90);
        } else if (timeFilter === 'year') {
            cutoffDate = new Date(); cutoffDate.setFullYear(now.getFullYear() - 1);
        }

        if (cutoffDate) {
            cutoffDate.setHours(0, 0, 0, 0);
            filteredTx = filteredTx.filter(tx => {
                const comp = getLocalDateComponents(tx.date);
                if (!comp) return false;
                const txDate = new Date(comp.year, comp.month, comp.day);
                return txDate >= cutoffDate;
            });
        }

        // 3. Filtrar por tipo de movimiento
        const typeFilter = document.getElementById('acc-history-type-filter')?.value || 'all';
        if (typeFilter !== 'all') {
            filteredTx = filteredTx.filter(tx => {
                if (typeFilter === 'transfer') {
                    return tx.type === 'transfer';
                }
                
                // Si es una transferencia, no clasifica como ingreso/gasto estándar de la cuenta
                if (tx.type === 'transfer') return false;

                // Transacción estándar: verificar tipo de categoría
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                return cat && cat.type === typeFilter;
            });
        }

        if (filteredTx.length === 0) {
            listContainer.innerHTML = '<div class="empty-state">No hay movimientos en este período</div>';
            return;
        }

        // 4. Ordenar transacciones cronológicamente (más recientes primero)
        const sortedTx = [...filteredTx].sort((a, b) => {
            const dateA = standardizeDate(a.date);
            const dateB = standardizeDate(b.date);
            const dateComp = dateB.localeCompare(dateA);
            if (dateComp !== 0) return dateComp;
            return (parseFloat(b.id) || 0) - (parseFloat(a.id) || 0);
        });

        // 5. Agrupar por fecha
        const groups = {};
        sortedTx.forEach(tx => {
            const dateStr = standardizeDate(tx.date);
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(tx);
        });

        let html = '';
        Object.entries(groups).forEach(([dateStr, txs]) => {
            let formattedGroupDate = dateStr;
            if (dateStr !== 'Fecha desconocida') {
                try {
                    const parts = dateStr.split('-');
                    if (parts.length === 3) {
                        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                        formattedGroupDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                        formattedGroupDate = formattedGroupDate.charAt(0).toUpperCase() + formattedGroupDate.slice(1);
                    }
                } catch (e) {
                    console.error(e);
                }

                // Obtener fecha local de hoy y ayer
                const getLocalDateStr = (d) => {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    return `${yyyy}-${mm}-${dd}`;
                };

                const todayStr = getLocalDateStr(new Date());
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = getLocalDateStr(yesterday);

                if (dateStr === todayStr) {
                    formattedGroupDate = 'Hoy';
                } else if (dateStr === yesterdayStr) {
                    formattedGroupDate = 'Ayer';
                }
            } else {
                formattedGroupDate = 'Fecha desconocida';
            }

            const itemsHtml = txs.map(tx => {
                // Caso especial para Transferencias
                if (tx.type === 'transfer') {
                    const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id)) || { name: 'Cuenta Origen', currency: '' };
                    const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id)) || { name: 'Cuenta Destino', currency: '' };
                    
                    const isOutgoing = String(tx.from_account_id) === String(accId);

                    return `
                        <div class="transaction-item edit-acc-tx-trigger" data-id="${tx.id}" style="border-left: 4px solid var(--accent-gold); cursor: pointer;">
                            <div class="t-info">
                                <div class="t-icon" style="background-color: var(--accent-gold); color: #fff;">
                                    <i class="fa-solid fa-exchange-alt"></i>
                                </div>
                                <div class="t-text">
                                    <span class="t-name">Transferencia interna</span>
                                    <span class="t-date">${fromAcc.name} ➜ ${toAcc.name}</span>
                                    ${parseFloat(tx.fee || 0) > 0 && isOutgoing ? `<span style="font-size:0.75rem; color:#C1773A; font-style:italic;"><i class="fas fa-receipt" style="margin-right:3px;"></i>Comisión: ${parseFloat(tx.fee).toFixed(2)} ${fromAcc.currency}</span>` : ''}
                                </div>
                            </div>
                            <div style="text-align: right; line-height: 1.2;">
                                ${isOutgoing 
                                    ? `<span class="amount-expense" style="font-size: 0.95rem; font-weight: 700;">-${parseFloat(tx.amount_extracted || 0).toFixed(2)} ${fromAcc.currency}</span>`
                                    : `<span class="amount-income" style="font-size: 0.95rem; font-weight: 700;">+${parseFloat(tx.amount_received || 0).toFixed(2)} ${toAcc.currency}</span>`
                                }
                            </div>
                        </div>
                    `;
                }

                const cat = categories.find(c => String(c.id) === String(tx.category_id)) || { icon: 'fa-tag', visual_color: '#ccc', name: 'Otros', type: 'expense' };
                const amountSign = cat.type === 'expense' ? '-' : '+';
                const amountClass = cat.type === 'expense' ? 'amount-expense' : 'amount-income';
                
                let iconClass = cat.icon || 'fa-tag';
                if (!iconClass.startsWith('fa-')) iconClass = 'fa-' + iconClass;

                return `
                    <div class="transaction-item edit-acc-tx-trigger" data-id="${tx.id}" style="border-left: 4px solid ${cat.visual_color || '#ccc'}; cursor: pointer;">
                        <div class="t-info">
                            <div class="t-icon" style="background-color: ${cat.visual_color}">
                                <i class="fa-solid ${iconClass}"></i>
                            </div>
                            <div class="t-text">
                                <span class="t-name">${cat.name}</span>
                                <span class="t-date">${tx.notes ? tx.notes : 'Sin descripción'}</span>
                            </div>
                        </div>
                        <div class="t-amount ${amountClass}">${amountSign}$${parseFloat(tx.amount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                `;
            }).join('');

            html += `
                <div class="transaction-group">
                    <div class="transaction-group-header">${formattedGroupDate}</div>
                    <div class="transaction-group-items">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;

        // Añadir event listeners para la edición de transacciones desde el historial del modal
        listContainer.querySelectorAll('.edit-acc-tx-trigger').forEach(item => {
            item.addEventListener('click', () => {
                const txId = item.dataset.id;
                // Ocultar modal del historial primero para evitar solapamientos
                document.getElementById('account-history-modal').classList.add('hidden');
                if (window.FormService) {
                    window.FormService.openTransactionEditModal(txId);
                }
            });
        });
    }
};
