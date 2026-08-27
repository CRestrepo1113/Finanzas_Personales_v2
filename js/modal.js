import { escapeHTML } from './ui.js';

export const ModalService = {
    _resolve: null,

    init() {
        const modal = document.getElementById('custom-dialog-modal');
        const confirmBtn = document.getElementById('custom-dialog-confirm-btn');
        const cancelBtn = document.getElementById('custom-dialog-cancel-btn');
        const closeX = document.getElementById('custom-dialog-close-x');

        if (!modal) return;

        confirmBtn?.addEventListener('click', () => {
            this._finish(true);
        });

        cancelBtn?.addEventListener('click', () => {
            this._finish(false);
        });

        closeX?.addEventListener('click', () => {
            this._finish(false);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this._finish(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!modal || modal.classList.contains('hidden')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this._finish(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._finish(true);
            }
        });
    },

    _finish(result) {
        const modal = document.getElementById('custom-dialog-modal');
        if (modal) modal.classList.add('hidden');
        if (this._resolve) {
            const res = this._resolve;
            this._resolve = null;
            res(result);
        }
    },

    alert(message, title = 'Aviso', type = 'info') {
        return new Promise((resolve) => {
            this._resolve = resolve;
            const modal = document.getElementById('custom-dialog-modal');
            const titleEl = document.getElementById('custom-dialog-title-text');
            const iconEl = document.getElementById('custom-dialog-icon');
            const bodyEl = document.getElementById('custom-dialog-body');
            const cancelBtn = document.getElementById('custom-dialog-cancel-btn');
            const confirmBtn = document.getElementById('custom-dialog-confirm-btn');

            if (!modal) {
                if (typeof window !== 'undefined' && window.alert) window.alert(message);
                return resolve(true);
            }

            if (titleEl) titleEl.textContent = title;
            if (bodyEl) bodyEl.innerHTML = `<p style="margin:0;">${escapeHTML(message)}</p>`;
            if (cancelBtn) cancelBtn.classList.add('hidden');
            if (confirmBtn) {
                confirmBtn.textContent = 'Entendido';
                confirmBtn.style.backgroundColor = 'var(--accent-gold)';
                confirmBtn.style.color = 'var(--text-primary)';
            }

            if (iconEl) {
                iconEl.className = type === 'error' ? 'fas fa-exclamation-triangle' : (type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle');
            }

            modal.classList.remove('hidden');
            if (confirmBtn && typeof confirmBtn.focus === 'function') {
                confirmBtn.focus();
            }
        });
    },

    confirm(message, title = 'Confirmación', confirmText = 'Aceptar', cancelText = 'Cancelar') {
        return new Promise((resolve) => {
            this._resolve = resolve;
            const modal = document.getElementById('custom-dialog-modal');
            const titleEl = document.getElementById('custom-dialog-title-text');
            const iconEl = document.getElementById('custom-dialog-icon');
            const bodyEl = document.getElementById('custom-dialog-body');
            const cancelBtn = document.getElementById('custom-dialog-cancel-btn');
            const confirmBtn = document.getElementById('custom-dialog-confirm-btn');

            if (!modal) {
                const res = typeof window !== 'undefined' && window.confirm ? window.confirm(message) : true;
                return resolve(res);
            }

            if (titleEl) titleEl.textContent = title;
            if (bodyEl) bodyEl.innerHTML = `<p style="margin:0;">${escapeHTML(message)}</p>`;
            if (cancelBtn) {
                cancelBtn.classList.remove('hidden');
                cancelBtn.textContent = cancelText;
            }
            if (confirmBtn) {
                confirmBtn.textContent = confirmText;
                confirmBtn.style.backgroundColor = 'var(--action-expense)';
                confirmBtn.style.color = '#fff';
            }

            if (iconEl) {
                iconEl.className = 'fas fa-question-circle';
            }

            modal.classList.remove('hidden');
            if (confirmBtn && typeof confirmBtn.focus === 'function') {
                confirmBtn.focus();
            }
        });
    }
};