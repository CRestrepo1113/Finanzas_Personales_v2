import { State } from './state.js';

export const NotificationService = {
    init() {
        // Solicitar permisos de notificación de manera amigable al primer clic
        if ('Notification' in window && Notification.permission === 'default') {
            document.addEventListener('click', () => {
                if (Notification.permission === 'default') {
                    Notification.requestPermission()
                        .then(permission => {
                            console.log('Notification API: Permiso de notificaciones:', permission);
                        });
                }
            }, { once: true });
        }

        // Suscribirse a cambios en el estado para actualizar la UI en tiempo real
        State.subscribe(() => this.checkPayments(false));
        
        // Ejecución inicial con notificaciones de sistema activas
        this.checkPayments(true);
    },

    // Guardar las notificaciones ya enviadas en esta sesión para no saturar al usuario
    sentNotifications: new Set(),

    checkPayments(triggerSystemNotifications = false) {
        if (!State.db) return;

        const { categories, transactions } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const upcomingPayments = [];

        categories.forEach(cat => {
            if (cat.type === 'expense' && cat.subtype === 'fixed' && cat.payment_day) {
                const day = parseInt(cat.payment_day);
                if (isNaN(day)) return;
                
                // 1. Determinar si ya se pagó en el mes actual
                const currentMonthTxs = transactions.filter(tx => {
                    if (String(tx.category_id) !== String(cat.id)) return false;
                    if (tx.type === 'transfer') return false; // Transferencias no se catalogan en gastos fijos
                    
                    const txDate = new Date(tx.date);
                    // Convertir a fecha local sin desfase
                    const txLocal = new Date(txDate.getUTCFullYear(), txDate.getUTCMonth(), txDate.getUTCDate());
                    
                    return txLocal.getFullYear() === today.getFullYear() && txLocal.getMonth() === today.getMonth();
                });

                const isPaidThisMonth = currentMonthTxs.length > 0;
                
                // 2. Definir la fecha del vencimiento objetivo
                let targetDate;
                if (!isPaidThisMonth) {
                    targetDate = new Date(today.getFullYear(), today.getMonth(), day);
                } else {
                    targetDate = new Date(today.getFullYear(), today.getMonth() + 1, day);
                }

                // 3. Calcular la diferencia en días
                const diffTime = targetDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // 4. Si falta 3 días o menos (y no se ha pagado aún en su período correspondiente)
                if (!isPaidThisMonth && diffDays <= 3) {
                    upcomingPayments.push({
                        category: cat,
                        targetDate: targetDate,
                        diffDays: diffDays,
                        amount: parseFloat(cat.budget) || 0
                    });
                }
            }
        });

        // Ordenar: primero los atrasados (diffDays menor), luego hoy (0), luego próximos
        upcomingPayments.sort((a, b) => a.diffDays - b.diffDays);

        // Renderizar en la UI
        this.renderUI(upcomingPayments);

        // Enviar notificaciones de sistema si aplica y tenemos permisos
        if (triggerSystemNotifications && 'Notification' in window && Notification.permission === 'granted') {
            upcomingPayments.forEach(payment => {
                const key = `${payment.category.id}_${payment.targetDate.toISOString().split('T')[0]}`;
                if (!this.sentNotifications.has(key)) {
                    let title = "";
                    let body = "";

                    if (payment.diffDays < 0) {
                        title = `¡Pago Atrasado: ${payment.category.name}!`;
                        body = `Venció hace ${Math.abs(payment.diffDays)} días (el día ${payment.targetDate.getDate()}). Presupuesto: $${payment.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency}.`;
                    } else if (payment.diffDays === 0) {
                        title = `¡Vence Hoy: ${payment.category.name}!`;
                        body = `Tienes programado este pago para hoy. Presupuesto: $${payment.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency}.`;
                    } else {
                        title = `Próximo Pago: ${payment.category.name}`;
                        body = `Vence en ${payment.diffDays} días (el día ${payment.targetDate.getDate()}). Presupuesto: $${payment.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency}.`;
                    }

                    try {
                        new Notification(title, {
                            body: body,
                            icon: './app-icon.png'
                        });
                        this.sentNotifications.add(key);
                    } catch (e) {
                        console.warn("Notification Service: Error al lanzar notificación nativa:", e);
                    }
                }
            });
        }
    },

    renderUI(payments) {
        const section = document.getElementById('upcoming-payments-section');
        const list = document.getElementById('upcoming-payments-list');
        if (!section || !list) return;

        if (payments.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');

        list.innerHTML = payments.map(p => {
            let statusText = "";
            let badgeClass = "";
            let cardStyle = "";

            if (p.diffDays < 0) {
                statusText = `Atrasado por ${Math.abs(p.diffDays)} días`;
                badgeClass = "badge-danger";
                cardStyle = "border-left: 4px solid var(--action-expense); background: rgba(178, 58, 30, 0.05);";
            } else if (p.diffDays === 0) {
                statusText = "Vence hoy";
                badgeClass = "badge-warning";
                cardStyle = "border-left: 4px solid var(--accent-gold); background: rgba(223, 181, 116, 0.05);";
            } else {
                statusText = `Vence en ${p.diffDays} días`;
                badgeClass = "badge-info";
                cardStyle = "border-left: 4px solid #A5BCA6; background: rgba(165, 188, 166, 0.05);";
            }

            const baseCurrency = State.db.settings.baseCurrency || 'USD';
            const catColor = p.category.visual_color || '#ccc';
            let catIcon = p.category.icon || 'fa-tag';
            if (!catIcon.startsWith('fa-')) catIcon = 'fa-' + catIcon;

            return `
                <div class="upcoming-payment-card" style="${cardStyle} display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 8px; border: 2px solid var(--text-primary); transition: transform 0.2s;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background-color: ${catColor}; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; border: 1.5px solid var(--text-primary);">
                            <i class="fa-solid ${catIcon}"></i>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <span style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${p.category.name}</span>
                            <span style="font-size: 0.8rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                                <i class="fa-regular fa-calendar"></i> Día de pago: ${p.category.payment_day} de cada mes
                            </span>
                        </div>
                    </div>
                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <span style="font-weight: 700; font-family: 'Inconsolata'; font-size: 1rem; color: var(--text-primary);">
                            $${p.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency}
                        </span>
                        <span class="badge ${badgeClass}" style="font-size: 0.75rem; font-weight: bold;">
                            ${statusText}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }
};
