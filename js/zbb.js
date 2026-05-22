import { State } from './state.js';

export const ZBBService = {
    init() {
        const incomeInput = document.getElementById('zbb-income-input');
        const saveBtn = document.getElementById('zbb-save-btn');

        if (incomeInput) {
            // Cargar el ingreso guardado
            const savedIncome = State.db.settings.zbbIncome || 0;
            incomeInput.value = savedIncome > 0 ? savedIncome : '';

            incomeInput.addEventListener('input', () => {
                this.calculateDelta();
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveBudget());
        }

        State.subscribe(() => this.renderCategories());
        this.renderCategories();
    },

    renderCategories() {
        const list = document.getElementById('zbb-categories-list');
        if (!list) return;

        const categories = State.db.categories.filter(c => c.type === 'expense');

        // Agrupar categorías de gasto
        const needsCats = categories.filter(c => !c.subtype || c.subtype === 'fixed');
        const wantsCats = categories.filter(c => c.subtype === 'variable');
        
        // Agrupar cuentas para Futuros (ahorro y deuda)
        const futuresAccounts = State.db.accounts.filter(a => a.type === 'savings' || a.type === 'debt');

        // Mapeador auxiliar de filas para categorías
        const renderCatRow = (cat) => `
            <div class="transaction-item" style="padding: 12px 15px; margin-bottom: 5px; background-color: var(--bg-primary); border-radius: 8px 4px 6px 2px; border: 1.5px solid var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                    <div class="t-icon" style="background-color: ${cat.visual_color}; width: 34px; height: 34px; border: 1.5px solid var(--text-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.9rem;">
                        <i class="fa-solid ${cat.icon || 'fa-tag'}"></i>
                    </div>
                    <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${cat.name}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-family: var(--font-heading); font-weight: bold; color: var(--text-secondary);">$</span>
                    <input type="number" class="zbb-input filter-select" 
                        data-id="${cat.id}" 
                        data-subtype="${cat.subtype || 'fixed'}"
                        style="width: 100px; text-align: right; font-family: 'Inconsolata'; font-weight: bold; font-size: 1.05rem; padding: 6px; border-radius: 4px; border: 1.5px solid var(--text-primary);" 
                        value="${cat.budget || 0}" 
                        placeholder="0"
                        oninput="ZBBService.calculateDelta()">
                </div>
            </div>
        `;

        // Mapeador de filas para cuentas
        const renderAccRow = (acc) => `
            <div class="transaction-item" style="padding: 12px 15px; margin-bottom: 5px; background-color: var(--bg-primary); border-radius: 8px 4px 6px 2px; border: 1.5px solid var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                    <div class="t-icon" style="background-color: ${acc.color || '#A5BCA6'}; width: 34px; height: 34px; border: 1.5px solid var(--text-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.9rem;">
                        <i class="fa-solid ${acc.type === 'savings' ? 'fa-piggy-bank' : 'fa-hand-holding-dollar'}"></i>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${acc.name}</span>
                        <span style="font-size: 0.72rem; color: var(--text-secondary); text-transform: uppercase;">
                            ${acc.type === 'savings' ? 'Ahorro' : 'Deuda'} | Balance: $${acc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${acc.currency}
                        </span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-family: var(--font-heading); font-weight: bold; color: var(--text-secondary);">$</span>
                    <input type="number" class="zbb-input filter-select" 
                        data-id="${acc.id}" 
                        data-is-account="true"
                        data-subtype="future"
                        style="width: 100px; text-align: right; font-family: 'Inconsolata'; font-weight: bold; font-size: 1.05rem; padding: 6px; border-radius: 4px; border: 1.5px solid var(--text-primary);" 
                        value="${acc.budget || 0}" 
                        placeholder="0"
                        oninput="ZBBService.calculateDelta()">
                </div>
            </div>
        `;

        // Armar el HTML agrupado en bloques con estilo premium
        list.innerHTML = `
            <!-- SECCIÓN: NECESIDADES (50%) -->
            <div class="settings-card" style="margin-bottom: 20px; border: 2.5px solid var(--text-primary); border-radius: 12px 4px 10px 6px; padding: 20px; background-color: var(--bg-card); box-shadow: var(--shadow-neo);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.15rem; font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house-chimney" style="font-size: 1rem; color: var(--text-primary);"></i>
                        Necesidades (Fijo) 
                        <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--text-secondary); font-family: var(--font-body);">Ideal 50%</span>
                    </h3>
                    <div style="font-family: 'Inconsolata'; font-size: 0.9rem; font-weight: bold; color: var(--text-primary);">
                        Ideal: <span id="zbb-needs-ideal">$0.00</span> | Asignado: <span id="zbb-needs-allocated">$0.00</span> (<span id="zbb-needs-pct">0%</span>)
                    </div>
                </div>
                <div style="height: 10px; background: rgba(0,0,0,0.04); border-radius: 6px; border: 1.5px solid var(--text-primary); margin-top: 12px; margin-bottom: 16px; overflow: hidden; position: relative;">
                    <div id="zbb-needs-progress-bar" style="width: 0%; height: 100%; background: #2B2B2B; transition: width 0.3s ease;"></div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                    ${needsCats.length > 0 ? needsCats.map(renderCatRow).join('') : '<p style="color: var(--text-secondary); font-size: 0.85rem; font-style: italic; text-align: center; margin: 15px 0;">No hay categorías en Necesidades.</p>'}
                </div>
            </div>

            <!-- SECCIÓN: DESEOS (30%) -->
            <div class="settings-card" style="margin-bottom: 20px; border: 2.5px solid var(--text-primary); border-radius: 12px 4px 10px 6px; padding: 20px; background-color: var(--bg-card); box-shadow: var(--shadow-neo);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.15rem; font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-gift" style="font-size: 1rem; color: #D9A098;"></i>
                        Deseos (Variable) 
                        <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--text-secondary); font-family: var(--font-body);">Ideal 30%</span>
                    </h3>
                    <div style="font-family: 'Inconsolata'; font-size: 0.9rem; font-weight: bold; color: var(--text-primary);">
                        Ideal: <span id="zbb-wants-ideal">$0.00</span> | Asignado: <span id="zbb-wants-allocated">$0.00</span> (<span id="zbb-wants-pct">0%</span>)
                    </div>
                </div>
                <div style="height: 10px; background: rgba(0,0,0,0.04); border-radius: 6px; border: 1.5px solid var(--text-primary); margin-top: 12px; margin-bottom: 16px; overflow: hidden; position: relative;">
                    <div id="zbb-wants-progress-bar" style="width: 0%; height: 100%; background: #D9A098; transition: width 0.3s ease;"></div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                    ${wantsCats.length > 0 ? wantsCats.map(renderCatRow).join('') : '<p style="color: var(--text-secondary); font-size: 0.85rem; font-style: italic; text-align: center; margin: 15px 0;">No hay categorías en Deseos.</p>'}
                </div>
            </div>

            <!-- SECCIÓN: FUTUROS (20%) -->
            <div class="settings-card" style="margin-bottom: 20px; border: 2.5px solid var(--text-primary); border-radius: 12px 4px 10px 6px; padding: 20px; background-color: var(--bg-card); box-shadow: var(--shadow-neo);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.15rem; font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-piggy-bank" style="font-size: 1rem; color: #A5BCA6;"></i>
                        Futuro (Ahorro y Deuda) 
                        <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--text-secondary); font-family: var(--font-body);">Ideal 20%</span>
                    </h3>
                    <div style="font-family: 'Inconsolata'; font-size: 0.9rem; font-weight: bold; color: var(--text-primary);">
                        Ideal: <span id="zbb-futures-ideal">$0.00</span> | Asignado: <span id="zbb-futures-allocated">$0.00</span> (<span id="zbb-futures-pct">0%</span>)
                    </div>
                </div>
                <div style="height: 10px; background: rgba(0,0,0,0.04); border-radius: 6px; border: 1.5px solid var(--text-primary); margin-top: 12px; margin-bottom: 16px; overflow: hidden; position: relative;">
                    <div id="zbb-futures-progress-bar" style="width: 0%; height: 100%; background: #A5BCA6; transition: width 0.3s ease;"></div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                    ${futuresAccounts.length > 0 ? futuresAccounts.map(renderAccRow).join('') : '<p style="color: var(--text-secondary); font-size: 0.85rem; font-style: italic; text-align: center; margin: 15px 0;">Crea cuentas de tipo Ahorro o Deuda para presupuestar Futuros.</p>'}
                </div>
            </div>
        `;

        this.calculateDelta();
    },

    calculateDelta() {
        const income = parseFloat(document.getElementById('zbb-income-input').value) || 0;
        const inputs = document.querySelectorAll('.zbb-input');
        
        let totalAllocated = 0;
        let needsAllocated = 0;
        let wantsAllocated = 0;
        let futuresAllocated = 0;

        inputs.forEach(input => {
            const val = parseFloat(input.value) || 0;
            totalAllocated += val;
            
            const subtype = input.dataset.subtype;
            if (subtype === 'variable') {
                wantsAllocated += val;
            } else if (subtype === 'future') {
                futuresAllocated += val;
            } else {
                needsAllocated += val;
            }
        });

        // 1. Calcular ideales (Sugerido 50/30/20)
        const needsIdeal = income * 0.50;
        const wantsIdeal = income * 0.30;
        const futuresIdeal = income * 0.20;

        // 2. Calcular porcentajes de progreso de asignación
        const needsPct = needsIdeal > 0 ? (needsAllocated / needsIdeal) * 100 : 0;
        const wantsPct = wantsIdeal > 0 ? (wantsAllocated / wantsIdeal) * 100 : 0;
        const futuresPct = futuresIdeal > 0 ? (futuresAllocated / futuresIdeal) * 100 : 0;

        // 3. Actualizar textos en el DOM
        const formatVal = (v) => `$${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const elements = {
            'zbb-needs-ideal': formatVal(needsIdeal),
            'zbb-needs-allocated': formatVal(needsAllocated),
            'zbb-needs-pct': `${needsPct.toFixed(0)}%`,
            'zbb-wants-ideal': formatVal(wantsIdeal),
            'zbb-wants-allocated': formatVal(wantsAllocated),
            'zbb-wants-pct': `${wantsPct.toFixed(0)}%`,
            'zbb-futures-ideal': formatVal(futuresIdeal),
            'zbb-futures-allocated': formatVal(futuresAllocated),
            'zbb-futures-pct': `${futuresPct.toFixed(0)}%`
        };

        Object.entries(elements).forEach(([id, val]) => {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = val;
        });

        // 4. Actualizar anchos de barra de progreso en el DOM
        const progressBars = {
            'zbb-needs-progress-bar': needsPct,
            'zbb-wants-progress-bar': wantsPct,
            'zbb-futures-progress-bar': futuresPct
        };

        Object.entries(progressBars).forEach(([id, pct]) => {
            const bar = document.getElementById(id);
            if (bar) bar.style.width = `${Math.min(100, pct)}%`;
        });

        // 5. Calcular delta y actualizar remanente
        const delta = income - totalAllocated;
        const deltaElem = document.getElementById('zbb-delta-value');
        
        if (deltaElem) {
            deltaElem.textContent = `$${delta.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
            deltaElem.style.color = delta < 0 ? 'var(--action-expense)' : (delta === 0 ? 'var(--action-income)' : 'var(--text-primary)');
        }
    },

    saveBudget() {
        const incomeInput = document.getElementById('zbb-income-input');
        const income = parseFloat(incomeInput?.value) || 0;
        
        const inputs = document.querySelectorAll('.zbb-input');
        const catUpdates = [];
        const accUpdates = [];

        inputs.forEach(input => {
            const isAccount = input.dataset.isAccount === 'true';
            const id = input.dataset.id;
            const budgetVal = parseFloat(input.value) || 0;
            
            if (isAccount) {
                accUpdates.push({ id, budget: budgetVal });
            } else {
                catUpdates.push({ id, budget: budgetVal });
            }
        });

        State.updateCategoryBudgets(catUpdates, income, accUpdates);
        alert("Presupuesto guardado y sincronizado con tus categorías y cuentas.");
    }
};

// Hacerlo disponible globalmente para el evento oninput
window.ZBBService = ZBBService;
