import { State } from './state.js';

export const ZBBService = {
    init() {
        const incomeInput = document.getElementById('zbb-income-input');
        const saveBtn = document.getElementById('zbb-save-btn');

        if (incomeInput) {
            incomeInput.addEventListener('input', () => this.calculateDelta());
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

        const expenseCategories = State.db.categories.filter(c => c.type === 'expense');
        
        list.innerHTML = expenseCategories.map(cat => `
            <div class="transaction-item" style="padding: 15px;">
                <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                    <div class="t-icon" style="background-color: ${cat.visual_color}; width: 35px; height: 35px;">
                        <i class="fa-solid ${cat.icon}"></i>
                    </div>
                    <div>
                        <span style="font-weight: 700;">${cat.name}</span>
                        <br><small style="color: var(--text-secondary)">${cat.subtype === 'fixed' ? 'Necesidad' : 'Variable'}</small>
                    </div>
                </div>
                <input type="number" class="zbb-input filter-select" 
                    data-id="${cat.id}" 
                    style="width: 100px; text-align: right;" 
                    value="${cat.budget || 0}" 
                    oninput="ZBBService.calculateDelta()">
            </div>
        `).join('');

        this.calculateDelta();
    },

    calculateDelta() {
        const income = parseFloat(document.getElementById('zbb-income-input').value) || 0;
        const inputs = document.querySelectorAll('.zbb-input');
        
        let totalAllocated = 0;
        inputs.forEach(input => {
            totalAllocated += parseFloat(input.value) || 0;
        });

        const delta = income - totalAllocated;
        const deltaElem = document.getElementById('zbb-delta-value');
        
        if (deltaElem) {
            deltaElem.textContent = `$${delta.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
            deltaElem.style.color = delta < 0 ? 'var(--action-expense)' : (delta === 0 ? 'var(--action-income)' : 'var(--text-primary)');
        }
    },

    saveBudget() {
        const inputs = document.querySelectorAll('.zbb-input');
        const updates = [];

        inputs.forEach(input => {
            updates.push({
                id: input.dataset.id,
                budget: parseFloat(input.value) || 0
            });
        });

        State.updateCategoryBudgets(updates);
        alert("Presupuesto guardado y sincronizado con tus categorías.");
    }
};

// Hacerlo disponible globalmente para el evento oninput
window.ZBBService = ZBBService;
