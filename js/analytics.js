import { State } from './state.js';
import { getLocalDateComponents, standardizeDate, escapeHTML } from './ui.js';
import { ExportService } from './export.js';
import { ModalService } from './modal.js';

export const Analytics = {
    charts: {
        expenses: null,
        netWorth: null,
        zbbRule: null
    },
    activeSection: null,

    toLocalDateStr(dObj) {
        const yyyy = dObj.getFullYear();
        const mm = String(dObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    getFilterDates() {
        const timeFilter = document.getElementById('analytics-time-filter')?.value || 'all';
        const now = new Date();
        let startDate = null;
        let endDate = new Date(); // Por defecto hasta hoy

        if (timeFilter === 'week') {
            startDate = new Date();
            startDate.setDate(now.getDate() - 7);
        } else if (timeFilter === 'month') {
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
        } else if (timeFilter === '3months') {
            startDate = new Date();
            startDate.setDate(now.getDate() - 90);
        } else if (timeFilter === 'year') {
            startDate = new Date();
            startDate.setFullYear(now.getFullYear() - 1);
        } else if (timeFilter === 'custom') {
            const startVal = document.getElementById('analytics-start-date')?.value;
            const endVal = document.getElementById('analytics-end-date')?.value;
            if (startVal) {
                const compS = getLocalDateComponents(startVal);
                if (compS) startDate = new Date(compS.year, compS.month, compS.day);
            }
            if (endVal) {
                const compE = getLocalDateComponents(endVal);
                if (compE) endDate = new Date(compE.year, compE.month, compE.day);
            }
        }
        
        if (startDate) startDate.setHours(0, 0, 0, 0);
        if (endDate) endDate.setHours(23, 59, 59, 999);
        
        return { startDate, endDate };
    },

    renderKPIs() {
        const container = document.getElementById('analytics-kpi-container');
        if (!container) return;

        const { transactions, categories, accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};

        // 1. Obtener el rango de fechas actual
        const { startDate, endDate } = this.getFilterDates();

        // 2. Calcular los días del periodo actual para anualizar/mensualizar
        let diffDays = 30; // Por defecto 30 días si es 'all' y no hay registros
        if (startDate && endDate) {
            const diffTime = Math.abs(endDate - startDate);
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
        } else if (!startDate && transactions.length > 0) {
            // Historial Completo: desde la fecha de la transacción más antigua hasta hoy
            let oldestStr = standardizeDate(transactions[0].date);
            transactions.forEach(tx => {
                const s = standardizeDate(tx.date);
                if (s < oldestStr) oldestStr = s;
            });
            const comp = getLocalDateComponents(oldestStr);
            if (comp) {
                const oldestDate = new Date(comp.year, comp.month, comp.day);
                const diffTime = Math.abs(new Date() - oldestDate);
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
            }
        }

        const monthsFactor = diffDays / 30.417; // Factor de conversión a meses

        // 3. Filtrar transacciones en el periodo
        const filteredTx = transactions.filter(tx => {
            const comp = getLocalDateComponents(tx.date);
            if (!comp) return false;
            const txDate = new Date(comp.year, comp.month, comp.day);
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });

        // 4. Calcular ingresos y gastos en moneda base
        let totalIncome = 0;
        let totalExpenses = 0;

        filteredTx.forEach(tx => {
            if (tx.type !== 'transfer') {
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                if (cat) {
                    const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                    const currency = acc ? acc.currency : baseCurrency;
                    const rate = rates[currency] || 1;
                    const amountInBase = parseFloat(tx.amount || 0) / rate;

                    if (cat.type === 'income') {
                        totalIncome += amountInBase;
                    } else if (cat.type === 'expense') {
                        totalExpenses += amountInBase;
                    }
                }
            }
        });

        const netFlow = totalIncome - totalExpenses;

        // 5. Tasa de Ahorro Neto / Margen Neto
        let savingsRate = 0;
        if (totalIncome > 0) {
            savingsRate = (netFlow / totalIncome) * 100;
        } else if (totalExpenses > 0) {
            savingsRate = -100; // Pérdida pura
        }

        // 6. Efectivo disponible (Caja/Ahorros) en base a balances actuales en vivo
        // Excluimos las cuentas de deuda/tarjeta y consolidamos solo tipo savings o current
        let cashBalance = 0;
        accounts.forEach(acc => {
            if (acc.type === 'savings' || acc.type === 'current') {
                const rate = rates[acc.currency] || 1;
                cashBalance += (acc.balance || 0) / rate;
            }
        });

        // 7. Calcular Burn Rate Neto Mensual y Runway (Meses de Caja)
        // Burn Rate ocurre si los gastos del periodo exceden los ingresos
        const netDeficit = totalExpenses - totalIncome;
        const monthlyNetBurn = netDeficit > 0 ? (netDeficit / monthsFactor) : 0;

        let runwayText = 'Sostenible';
        let runwayFooter = 'Flujo neto positivo / superávit';
        let runwayColorClass = 'ok';
        let runwayIcon = 'fa-circle-check';

        if (monthlyNetBurn > 0) {
            const runwayMonths = cashBalance / monthlyNetBurn;
            if (runwayMonths === 0) {
                runwayText = 'Sin reservas';
                runwayFooter = 'Efectivo en caja agotado';
                runwayColorClass = 'error';
                runwayIcon = 'fa-triangle-exclamation';
            } else if (runwayMonths < 3) {
                runwayText = `${runwayMonths.toFixed(1)} meses`;
                runwayFooter = `Alerta: Reserva baja (< 3 meses)`;
                runwayColorClass = 'error';
                runwayIcon = 'fa-triangle-exclamation';
            } else if (runwayMonths < 6) {
                runwayText = `${runwayMonths.toFixed(1)} meses`;
                runwayFooter = `Reserva aceptable (3-6 meses)`;
                runwayColorClass = 'warn';
                runwayIcon = 'fa-circle-exclamation';
            } else {
                runwayText = `${runwayMonths.toFixed(1)} meses`;
                runwayFooter = `Reserva saludable (> 6 meses)`;
                runwayColorClass = 'ok';
                runwayIcon = 'fa-circle-check';
            }
        }

        // Color de la Tasa de Ahorro
        let savingsColorClass = 'ok';
        let savingsIcon = 'fa-arrow-trend-up';
        let savingsLabel = 'Tasa de Ahorro';
        if (savingsRate < 0) {
            savingsColorClass = 'error';
            savingsIcon = 'fa-arrow-trend-down';
        } else if (savingsRate < 20) {
            savingsColorClass = 'warn';
            savingsIcon = 'fa-hourglass-half';
        }

        // Color del Flujo Neto
        let flowColorClass = 'ok';
        let flowIcon = 'fa-scale-balanced';
        if (netFlow < 0) {
            flowColorClass = 'error';
            flowIcon = 'fa-scale-unbalanced-flip';
        }

        container.innerHTML = `
            <div class="kpi-grid">
                <!-- Tasa de Ahorro / Margen Neto -->
                <div class="kpi-card" data-kpi="savings">
                    <div class="kpi-card-header">
                        <span>${savingsLabel}</span>
                        <i class="fa-solid ${savingsIcon}" style="font-size: 0.95rem;"></i>
                    </div>
                    <div class="kpi-card-value">${savingsRate > -100 ? savingsRate.toFixed(1) + '%' : 'N/A'}</div>
                    <div class="kpi-card-footer" style="color: var(--action-${savingsColorClass === 'ok' ? 'income' : (savingsColorClass === 'error' ? 'expense' : 'gold')});">
                        <span>${savingsRate >= 20 ? 'Meta ideal alcanzada (>= 20%)' : (savingsRate >= 0 ? 'Progreso positivo' : 'Déficit financiero')}</span>
                    </div>
                </div>

                <!-- Flujo Neto del Periodo -->
                <div class="kpi-card" data-kpi="flow">
                    <div class="kpi-card-header">
                        <span>Flujo Neto</span>
                        <i class="fa-solid ${flowIcon}" style="font-size: 0.95rem;"></i>
                    </div>
                    <div class="kpi-card-value" style="font-family: 'Inconsolata';">
                        $${netFlow.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div class="kpi-card-footer" style="color: var(--action-${flowColorClass === 'ok' ? 'income' : 'expense'});">
                        <span>Ingresos: $${totalIncome.toLocaleString('es-ES', { maximumFractionDigits: 0 })} / Gastos: $${totalExpenses.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>

                <!-- Runway (Caja restante) -->
                <div class="kpi-card" data-kpi="runway">
                    <div class="kpi-card-header">
                        <span>Meses de Runway</span>
                        <i class="fa-solid ${runwayIcon}" style="font-size: 0.95rem;"></i>
                    </div>
                    <div class="kpi-card-value">${runwayText}</div>
                    <div class="kpi-card-footer" style="color: var(--action-${runwayColorClass === 'ok' ? 'income' : (runwayColorClass === 'error' ? 'expense' : 'gold')});">
                        <span>${runwayFooter}</span>
                    </div>
                </div>
            </div>
        `;
    },

    renderPredictivePanel() {
        const container = document.getElementById('analytics-predictive-container');
        if (!container) return;

        // 1. Extraer y agrupar transacciones de gasto e ingreso por mes
        const { transactions, categories, accounts, settings } = State.db;
        const allTx = transactions || [];
        const baseCurrency = settings?.baseCurrency || 'USD';
        const rates = settings?.exchangeRates || {};
        
        const monthlyExpenses = {};
        const monthlyIncome = {};
        const categoryMonthly = {};

        allTx.forEach(t => {
            if (t.category_id === 'transfer' || t.type === 'transfer') return;
            const comp = getLocalDateComponents(t.date);
            if (!comp) return;
            
            const monthKey = `${comp.year}-${String(comp.month + 1).padStart(2, '0')}`;
            
            const cat = categories.find(c => String(c.id) === String(t.category_id));
            const isExpense = t.type === 'expense' || (cat && cat.type === 'expense');
            const isIncome = t.type === 'income' || (cat && cat.type === 'income');

            const acc = accounts.find(a => String(a.id) === String(t.account_id));
            const currency = acc ? acc.currency : baseCurrency;
            const rate = rates[currency] || 1;
            const amountInBase = (parseFloat(t.amount) || 0) / rate;

            if (isExpense) {
                monthlyExpenses[monthKey] = (monthlyExpenses[monthKey] || 0) + amountInBase;
                
                if (!categoryMonthly[t.category_id]) categoryMonthly[t.category_id] = {};
                categoryMonthly[t.category_id][monthKey] = (categoryMonthly[t.category_id][monthKey] || 0) + amountInBase;
            } else if (isIncome) {
                monthlyIncome[monthKey] = (monthlyIncome[monthKey] || 0) + amountInBase;
            }
        });

        const sortedMonths = Object.keys(monthlyExpenses).sort();
        const N = sortedMonths.length;

        // Si hay menos de 2 meses de datos históricos de gastos, no se puede hacer una regresión/media móvil razonable
        if (N < 2) {
            container.innerHTML = `
                <div style="border: 2px solid var(--text-primary); background-color: var(--bg-card); padding: 25px; border-radius: 8px; text-align: center; box-shadow: 4px 4px 0px var(--text-primary); margin-top: 20px;">
                    <i class="fas fa-wand-magic-sparkles" style="font-size: 2.5rem; color: var(--text-secondary); margin-bottom: 12px;"></i>
                    <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 800; margin-bottom: 8px;">Historial Insuficiente</h3>
                    <p style="font-size: 0.95rem; line-height: 1.5; color: var(--text-secondary); max-width: 450px; margin: 0 auto;">
                        El Análisis Predictivo requiere al menos <strong>2 meses completos</strong> con transacciones de gastos registradas para calcular medias móviles y proyecciones de tendencias de consumo. Continúa registrando tus movimientos y vuelve pronto.
                    </p>
                </div>
            `;
            return;
        }

        // 2. Calcular pronóstico global usando Media Móvil Ponderada (WMA) de los últimos 3 meses
        let forecast = 0;
        let recentMonthsLog = [];

        if (N >= 3) {
            const m1 = monthlyExpenses[sortedMonths[N-1]]; // Mes más reciente (peso 3)
            const m2 = monthlyExpenses[sortedMonths[N-2]]; // Peso 2
            const m3 = monthlyExpenses[sortedMonths[N-3]]; // Peso 1
            forecast = (m1 * 3 + m2 * 2 + m3 * 1) / 6;
            recentMonthsLog = [sortedMonths[N-3], sortedMonths[N-2], sortedMonths[N-1]];
        } else {
            const m1 = monthlyExpenses[sortedMonths[N-1]]; // Mes más reciente (peso 2)
            const m2 = monthlyExpenses[sortedMonths[N-2]]; // Peso 1
            forecast = (m1 * 2 + m2 * 1) / 3;
            recentMonthsLog = [sortedMonths[N-2], sortedMonths[N-1]];
        }

        // 3. Calcular Desviación Estándar histórica para proyectar el Intervalo de Confianza (Rango Esperado)
        let sumExpenses = 0;
        sortedMonths.forEach(m => { sumExpenses += monthlyExpenses[m]; });
        const avgExpenses = sumExpenses / N;

        let varianceSum = 0;
        sortedMonths.forEach(m => {
            varianceSum += Math.pow(monthlyExpenses[m] - avgExpenses, 2);
        });
        let stdDev = Math.sqrt(varianceSum / N);

        // Si la desviación es muy baja (ej. meses casi idénticos), le damos un piso de variación del 8%
        if (stdDev < (forecast * 0.05)) {
            stdDev = forecast * 0.08;
        }

        const rangeLower = Math.max(0, forecast - stdDev);
        const rangeUpper = forecast + stdDev;

        // 4. Calcular ingresos promedio de los últimos 3 meses para Alertas Preventivas de Caja
        let totalIncome = 0;
        let incomeMonthsCount = 0;
        for (let i = Math.max(0, N - 3); i < N; i++) {
            totalIncome += (monthlyIncome[sortedMonths[i]] || 0);
            incomeMonthsCount++;
        }
        const avgIncome = totalIncome / (incomeMonthsCount || 1);

        const hasDeficitAlert = forecast > avgIncome && avgIncome > 0;

        const alertHTML = hasDeficitAlert ? `
            <div style="border: 2px solid var(--text-primary); background-color: var(--action-expense); color: #fff; padding: 15px; border-radius: 8px; margin-bottom: 25px; box-shadow: 4px 4px 0px var(--text-primary); display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.8rem; flex-shrink: 0;"></i>
                <div>
                    <strong style="font-family: var(--font-heading); font-size: 1.05rem;">Alerta de Caja: Déficit Proyectado</strong>
                    <p style="font-size: 0.85rem; margin-top: 3px; line-height: 1.3; opacity: 0.95;">
                        El gasto pronosticado para el próximo mes ($${forecast.toLocaleString('es-ES', { maximumFractionDigits: 0 })}) supera tu promedio de ingresos mensuales recientes ($${avgIncome.toLocaleString('es-ES', { maximumFractionDigits: 0 })}). Considera postergar compras variables o no esenciales.
                    </p>
                </div>
            </div>
        ` : `
            <div style="border: 2px solid var(--text-primary); background-color: var(--action-income); color: #fff; padding: 15px; border-radius: 8px; margin-bottom: 25px; box-shadow: 4px 4px 0px var(--text-primary); display: flex; align-items: center; gap: 12px;">
                <i class="fa-solid fa-circle-check" style="font-size: 1.8rem; flex-shrink: 0;"></i>
                <div>
                    <strong style="font-family: var(--font-heading); font-size: 1.05rem;">Balance Proyectado Sostenible</strong>
                    <p style="font-size: 0.85rem; margin-top: 3px; line-height: 1.3; opacity: 0.95;">
                        El gasto pronosticado para el próximo mes se mantiene dentro del rango de tus ingresos promedio recientes ($${avgIncome.toLocaleString('es-ES', { maximumFractionDigits: 0 })}). Tu salud financiera proyecta estabilidad.
                    </p>
                </div>
            </div>
        `;

        // 5. Proyecciones por categorías (WMA de 3 meses en categorías con mayor consumo)
        const categoryForecasts = [];
        Object.entries(categoryMonthly).forEach(([catId, history]) => {
            const cat = categories.find(c => String(c.id) === String(catId));
            if (!cat) return;

            let catForecast = 0;
            if (N >= 3) {
                const c1 = history[sortedMonths[N-1]] || 0;
                const c2 = history[sortedMonths[N-2]] || 0;
                const c3 = history[sortedMonths[N-3]] || 0;
                catForecast = (c1 * 3 + c2 * 2 + c3 * 1) / 6;
            } else {
                const c1 = history[sortedMonths[N-1]] || 0;
                const c2 = history[sortedMonths[N-2]] || 0;
                catForecast = (c1 * 2 + c2 * 1) / 3;
            }

            if (catForecast > 0) {
                categoryForecasts.push({
                    name: cat.name,
                    color: cat.color || 'var(--text-secondary)',
                    icon: cat.icon || 'fa-tag',
                    value: catForecast
                });
            }
        });

        // Ordenar categorías de mayor a menor consumo proyectado y tomar las 3 principales
        categoryForecasts.sort((a, b) => b.value - a.value);
        const topCategories = categoryForecasts.slice(0, 3);

        let categoriesHTML = '';
        if (topCategories.length > 0) {
            categoriesHTML = `
                <div style="margin-top: 25px;">
                    <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 800; margin-bottom: 15px; border-left: 4px solid var(--text-primary); padding-left: 10px;">
                        Top Categorías de Gasto Proyectadas
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${topCategories.map(cat => `
                            <div class="settings-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; border-radius: 6px; box-shadow: 2px 2px 0px var(--text-primary);">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <div style="background-color: ${cat.color}20; border: 1.5px solid var(--text-primary); color: ${cat.color}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.95rem;">
                                        <i class="fa-solid ${cat.icon}"></i>
                                    </div>
                                    <span style="font-family: var(--font-heading); font-weight: 800; font-size: 0.95rem; color: var(--text-primary);">${cat.name}</span>
                                </div>
                                <div style="text-align: right;">
                                    <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; display: block; margin-bottom: 2px;">Pronóstico</span>
                                    <span style="font-family: 'Inconsolata'; font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">$${cat.value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="margin-top: 10px;">
                <div style="background-color: var(--bg-card); border: 2px solid var(--text-primary); border-radius: 6px; padding: 15px; margin-bottom: 25px; box-shadow: 2px 2px 0px var(--text-primary); display: flex; align-items: center; gap: 10px; font-size: 0.9rem; line-height: 1.4; color: var(--text-secondary);">
                    <i class="fa-solid fa-circle-info" style="color: var(--text-primary); font-size: 1.15rem;"></i>
                    <span>Este panel estima tu comportamiento de gastos del próximo mes utilizando una Media Móvil Ponderada (WMA) de tu historial reciente y un rango de desviación estándar. Clic en las tarjetas para más detalles.</span>
                </div>

                ${alertHTML}

                <div class="compare-grid">
                    <!-- PRONÓSTICO GLOBAL -->
                    <div class="compare-card" data-kpi="predict-forecast">
                        <div class="compare-card-title">
                            <span>Pronóstico Próximo Mes</span>
                            <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 1rem; color: var(--text-primary);"></i>
                        </div>
                        <div class="compare-values-row" style="margin-top: 5px;">
                            <div class="compare-val-box">
                                <span class="compare-val-label">Gasto Ponderado Proyectado</span>
                                <span class="compare-val-num current" style="font-size: 1.55rem; color: var(--action-expense);">$${forecast.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 6px; font-size: 0.72rem; color: var(--text-secondary); line-height: 1.3;">
                            Calculado según la tendencia de los últimos meses: ${recentMonthsLog.join(', ')}.
                        </div>
                    </div>

                    <!-- RANGO DE CONFIANZA -->
                    <div class="compare-card" data-kpi="predict-range">
                        <div class="compare-card-title">
                            <span>Rango de Gasto Esperado</span>
                            <i class="fa-solid fa-arrows-left-right" style="font-size: 1rem; color: var(--text-primary);"></i>
                        </div>
                        <div class="compare-values-row" style="margin-top: 5px;">
                            <div class="compare-val-box">
                                <span class="compare-val-label">Intervalo de Probabilidad (Desv. Est.)</span>
                                <span class="compare-val-num current" style="font-size: 1.35rem; color: var(--text-primary);">
                                    $${rangeLower.toLocaleString('es-ES', { maximumFractionDigits: 0 })} - $${rangeUpper.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 6px; font-size: 0.72rem; color: var(--text-secondary); line-height: 1.3;">
                            Variación esperada basada en tu volatilidad de consumo mensual de $${stdDev.toLocaleString('es-ES', { maximumFractionDigits: 0 })}.
                        </div>
                    </div>
                </div>

                ${categoriesHTML}
            </div>
        `;
    },

    renderComparisonPanel() {
        const container = document.getElementById('analytics-compare-container');
        if (!container) return;

        const timeFilter = document.getElementById('analytics-time-filter')?.value || 'all';
        const { startDate, endDate } = this.getFilterDates();

        // Si no hay rango de fecha definido o es Historial Completo, no se puede hacer análisis comparativo de periodos equivalentes
        if (timeFilter === 'all' || !startDate || !endDate) {
            container.innerHTML = `
                <div style="border: 2px solid var(--text-primary); background-color: var(--bg-card); padding: 25px; border-radius: 8px; text-align: center; box-shadow: 4px 4px 0px var(--text-primary); margin-top: 20px;">
                    <i class="fas fa-calendar-alt" style="font-size: 2.5rem; color: var(--text-secondary); margin-bottom: 12px;"></i>
                    <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 800; margin-bottom: 8px;">Comparación Deshabilitada</h3>
                    <p style="font-size: 0.95rem; line-height: 1.5; color: var(--text-secondary); max-width: 400px; margin: 0 auto;">
                        Para realizar un análisis comparativo temporal, selecciona un rango de tiempo específico (ej. <strong>Últimos 30 Días</strong> o un <strong>Periodo Personalizado</strong>) en el menú de periodos superior.
                    </p>
                </div>
            `;
            return;
        }

        // 1. Calcular periodos comparativos
        // Periodo Anterior (MoM equivalente)
        const diffMs = Math.abs(endDate - startDate);
        const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
        
        const prevEndDate = new Date(startDate);
        prevEndDate.setDate(prevEndDate.getDate() - 1);
        const prevStartDate = new Date(prevEndDate);
        prevStartDate.setDate(prevStartDate.getDate() - days);

        // Año Anterior (YoY equivalente)
        const prevYearStartDate = new Date(startDate);
        prevYearStartDate.setFullYear(prevYearStartDate.getFullYear() - 1);
        const prevYearEndDate = new Date(endDate);
        prevYearEndDate.setFullYear(prevYearEndDate.getFullYear() - 1);

        // 2. Filtrar transacciones para cada periodo
        const { transactions, categories, accounts, settings } = State.db;
        const allTx = transactions || [];
        const baseCurrency = settings?.baseCurrency || 'USD';
        const rates = settings?.exchangeRates || {};

        const getPeriodMetrics = (pStart, pEnd) => {
            const start = standardizeDate(pStart);
            const end = standardizeDate(pEnd);
            
            let income = 0;
            let expenses = 0;

            allTx.forEach(t => {
                if (t.type === 'transfer' || t.category_id === 'transfer') return;
                const tDate = standardizeDate(t.date);
                if (tDate >= start && tDate <= end) {
                    const cat = categories.find(c => String(c.id) === String(t.category_id));
                    const isIncome = t.type === 'income' || (cat && cat.type === 'income');
                    const isExpense = t.type === 'expense' || (cat && cat.type === 'expense');

                    const acc = accounts.find(a => String(a.id) === String(t.account_id));
                    const currency = acc ? acc.currency : baseCurrency;
                    const rate = rates[currency] || 1;
                    const amountInBase = (parseFloat(t.amount) || 0) / rate;

                    if (isIncome) {
                        income += amountInBase;
                    } else if (isExpense) {
                        expenses += amountInBase;
                    }
                }
            });

            const netFlow = income - expenses;
            const savingsRate = income > 0 ? (netFlow / income) * 100 : (netFlow < 0 ? -100 : 0);

            return { income, expenses, netFlow, savingsRate };
        };

        const current = getPeriodMetrics(startDate, endDate);
        const prevMoM = getPeriodMetrics(prevStartDate, prevEndDate);
        const prevYoY = getPeriodMetrics(prevYearStartDate, prevYearEndDate);

        // Formateadores y cálculos de variación
        const getVariationInfo = (currVal, prevVal, isExpense = false) => {
            if (prevVal === 0) {
                return {
                    percentText: currVal > 0 ? '+100%' : '0%',
                    class: currVal > 0 ? (isExpense ? 'up-bad' : 'up-good') : 'neutral',
                    icon: currVal > 0 ? 'fa-arrow-trend-up' : 'fa-minus'
                };
            }
            const pct = ((currVal - prevVal) / prevVal) * 100;
            const pctSign = pct > 0 ? '+' : '';
            const pctText = `${pctSign}${pct.toFixed(1)}%`;
            let colorClass = 'neutral';
            let icon = 'fa-minus';

            if (pct > 0) {
                colorClass = isExpense ? 'up-bad' : 'up-good';
                icon = 'fa-arrow-trend-up';
            } else if (pct < 0) {
                colorClass = isExpense ? 'down-good' : 'down-bad';
                icon = 'fa-arrow-trend-down';
            }

            return { percentText: pctText, class: colorClass, icon };
        };

        const getSavingsVariationInfo = (currRate, prevRate) => {
            const diff = currRate - prevRate;
            const diffSign = diff > 0 ? '+' : '';
            const diffText = `${diffSign}${diff.toFixed(1)} p.p.`;
            let colorClass = 'neutral';
            let icon = 'fa-minus';

            if (diff > 0) {
                colorClass = 'up-good';
                icon = 'fa-arrow-trend-up';
            } else if (diff < 0) {
                colorClass = 'down-bad';
                icon = 'fa-arrow-trend-down';
            }

            return { text: diffText, class: colorClass, icon };
        };

        const getNetFlowVariationInfo = (currFlow, prevFlow) => {
            const diff = currFlow - prevFlow;
            const diffSign = diff > 0 ? '+' : '';
            const diffText = `${diffSign}$${Math.abs(diff).toLocaleString('es-ES', { maximumFractionDigits: 0 })}`;
            let colorClass = 'neutral';
            let icon = 'fa-minus';

            if (diff > 0) {
                colorClass = 'up-good';
                icon = 'fa-arrow-trend-up';
            } else if (diff < 0) {
                colorClass = 'down-bad';
                icon = 'fa-arrow-trend-down';
            }

            return { text: diffText, class: colorClass, icon };
        };

        // Anchos de barra comparativa
        const getBarPct = (curr, prev) => {
            const max = Math.max(curr, prev);
            if (max === 0) return 0;
            return (curr / max) * 100;
        };

        // Obtener variaciones de Ingresos
        const incMoM = getVariationInfo(current.income, prevMoM.income, false);
        const incYoY = getVariationInfo(current.income, prevYoY.income, false);

        // Obtener variaciones de Gastos
        const expMoM = getVariationInfo(current.expenses, prevMoM.expenses, true);
        const expYoY = getVariationInfo(current.expenses, prevYoY.expenses, true);

        // Obtener variaciones de Flujo Neto
        const flowMoM = getNetFlowVariationInfo(current.netFlow, prevMoM.netFlow);
        const flowYoY = getNetFlowVariationInfo(current.netFlow, prevYoY.netFlow);

        // Obtener variaciones de Tasa de Ahorro
        const savMoM = getSavingsVariationInfo(current.savingsRate, prevMoM.savingsRate);
        const savYoY = getSavingsVariationInfo(current.savingsRate, prevYoY.savingsRate);

        container.innerHTML = `
            <div style="margin-top: 10px;">
                <div style="background-color: var(--bg-card); border: 2px solid var(--text-primary); border-radius: 6px; padding: 15px; margin-bottom: 25px; box-shadow: 2px 2px 0px var(--text-primary); display: flex; align-items: center; gap: 10px; font-size: 0.9rem; line-height: 1.4; color: var(--text-secondary);">
                    <i class="fa-solid fa-circle-info" style="color: var(--text-primary); font-size: 1.15rem;"></i>
                    <span>Este panel unifica el análisis comparativo temporal. Cada tarjeta muestra el valor actual del periodo y lo contrasta simultáneamente frente al periodo previo (MoM) y al mismo periodo del año anterior (YoY). Transferencias excluidas. Clic en las tarjetas para más info.</span>
                </div>

                <div class="compare-grid">
                    <!-- INGRESOS -->
                    <div class="compare-card" data-kpi="compare-income">
                        <div class="compare-card-title" style="margin-bottom: 8px;">
                            <span>Ingresos</span>
                            <span style="font-family: 'Inconsolata'; font-size: 1.35rem; font-weight: 800; color: var(--action-income);">
                                $${current.income.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>

                        <!-- Fila MoM -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Previo (MoM):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px;">
                                    $${prevMoM.income.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span class="variation-badge ${incMoM.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${incMoM.icon}"></i> ${incMoM.percentText}
                                </span>
                            </div>
                            <div class="compare-progress-container" style="height: 6px; margin-top: 2px;">
                                <div class="compare-progress-bar" style="width: ${getBarPct(current.income, prevMoM.income)}%; background-color: var(--action-income);"></div>
                            </div>
                        </div>

                        <!-- Fila YoY -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Año Ant. (YoY):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px;">
                                    $${prevYoY.income.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span class="variation-badge ${incYoY.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${incYoY.icon}"></i> ${incYoY.percentText}
                                </span>
                            </div>
                            <div class="compare-progress-container" style="height: 6px; margin-top: 2px;">
                                <div class="compare-progress-bar" style="width: ${getBarPct(current.income, prevYoY.income)}%; background-color: var(--action-income);"></div>
                            </div>
                        </div>
                    </div>

                    <!-- GASTOS -->
                    <div class="compare-card" data-kpi="compare-expenses">
                        <div class="compare-card-title" style="margin-bottom: 8px;">
                            <span>Gastos</span>
                            <span style="font-family: 'Inconsolata'; font-size: 1.35rem; font-weight: 800; color: var(--action-expense);">
                                $${current.expenses.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>

                        <!-- Fila MoM -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Previo (MoM):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px;">
                                    $${prevMoM.expenses.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span class="variation-badge ${expMoM.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${expMoM.icon}"></i> ${expMoM.percentText}
                                </span>
                            </div>
                            <div class="compare-progress-container" style="height: 6px; margin-top: 2px;">
                                <div class="compare-progress-bar" style="width: ${getBarPct(current.expenses, prevMoM.expenses)}%; background-color: var(--action-expense);"></div>
                            </div>
                        </div>

                        <!-- Fila YoY -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Año Ant. (YoY):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px;">
                                    $${prevYoY.expenses.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span class="variation-badge ${expYoY.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${expYoY.icon}"></i> ${expYoY.percentText}
                                </span>
                            </div>
                            <div class="compare-progress-container" style="height: 6px; margin-top: 2px;">
                                <div class="compare-progress-bar" style="width: ${getBarPct(current.expenses, prevYoY.expenses)}%; background-color: var(--action-expense);"></div>
                            </div>
                        </div>
                    </div>

                    <!-- FLUJO NETO -->
                    <div class="compare-card" data-kpi="compare-flow">
                        <div class="compare-card-title" style="margin-bottom: 8px;">
                            <span>Flujo Neto</span>
                            <span style="font-family: 'Inconsolata'; font-size: 1.35rem; font-weight: 800; color: var(--action-${current.netFlow >= 0 ? 'income' : 'expense'});">
                                $${current.netFlow.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>

                        <!-- Fila MoM -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Previo (MoM):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px; color: var(--action-${prevMoM.netFlow >= 0 ? 'income' : 'expense'});">
                                    $${prevMoM.netFlow.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span class="variation-badge ${flowMoM.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${flowMoM.icon}"></i> ${flowMoM.text}
                                </span>
                            </div>
                        </div>

                        <!-- Fila YoY -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Año Ant. (YoY):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px; color: var(--action-${prevYoY.netFlow >= 0 ? 'income' : 'expense'});">
                                    $${prevYoY.netFlow.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span class="variation-badge ${flowYoY.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${flowYoY.icon}"></i> ${flowYoY.text}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- TASA DE AHORRO -->
                    <div class="compare-card" data-kpi="compare-savings">
                        <div class="compare-card-title" style="margin-bottom: 8px;">
                            <span>Tasa de Ahorro</span>
                            <span style="font-family: 'Inconsolata'; font-size: 1.35rem; font-weight: 800; color: var(--text-primary);">
                                ${current.savingsRate > -100 ? current.savingsRate.toFixed(1) + '%' : 'N/A'}
                            </span>
                        </div>

                        <!-- Fila MoM -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Previo (MoM):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px;">
                                    ${prevMoM.savingsRate > -100 ? prevMoM.savingsRate.toFixed(1) + '%' : 'N/A'}
                                </span>
                                <span class="variation-badge ${savMoM.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${savMoM.icon}"></i> ${savMoM.text}
                                </span>
                            </div>
                        </div>

                        <!-- Fila YoY -->
                        <div style="border-top: 1px dashed rgba(43,43,43,0.15); padding-top: 8px; margin-top: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">Año Ant. (YoY):</span>
                                <span style="font-family: 'Inconsolata'; font-weight: 800; font-size: 0.95rem; margin-right: auto; margin-left: 8px;">
                                    ${prevYoY.savingsRate > -100 ? prevYoY.savingsRate.toFixed(1) + '%' : 'N/A'}
                                </span>
                                <span class="variation-badge ${savYoY.class}" style="padding: 2px 5px; font-size: 0.72rem; box-shadow: 1px 1px 0px var(--text-primary);">
                                    <i class="fa-solid ${savYoY.icon}"></i> ${savYoY.text}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    showSection(sectionId) {
        console.log(`Analytics: Mostrando sección: ${sectionId}`);
        // Guardar sección activa
        this.activeSection = sectionId;

        // Ocultar menú principal
        document.getElementById('analytics-menu')?.classList.add('hidden');
        // Mostrar botón de volver
        document.getElementById('analytics-back-btn')?.classList.remove('hidden');

        // Ocultar todas las secciones
        const sections = [
            'analytics-kpi-container',
            'expenses-chart-card-container',
            'net-worth-chart-container',
            'zbb-rule-chart-container',
            'budget-progress-container',
            'analytics-compare-container',
            'analytics-predictive-container',
            'analytics-debt-container',
            'analytics-split-container',
            'analytics-export-container'
        ];
        sections.forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });

        // Mostrar la sección seleccionada
        document.getElementById(sectionId)?.classList.remove('hidden');
    },

    showMenu() {
        console.log("Analytics: Volviendo al menú principal");
        this.activeSection = null;

        // Ocultar botón de volver
        document.getElementById('analytics-back-btn')?.classList.add('hidden');
        // Mostrar menú principal
        document.getElementById('analytics-menu')?.classList.remove('hidden');

        // Ocultar todas las secciones
        const sections = [
            'analytics-kpi-container',
            'expenses-chart-card-container',
            'net-worth-chart-container',
            'zbb-rule-chart-container',
            'budget-progress-container',
            'analytics-compare-container',
            'analytics-predictive-container',
            'analytics-debt-container',
            'analytics-split-container',
            'analytics-export-container'
        ];
        sections.forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });
    },

    init() {
        console.log("Analytics: Inicializando gráficos...");
        
        // Inicializar fechas de inputs personalizados por defecto (últimos 30 días)
        const startDateInput = document.getElementById('analytics-start-date');
        const endDateInput = document.getElementById('analytics-end-date');
        const customRangeContainer = document.getElementById('analytics-custom-range');
        
        if (startDateInput && endDateInput) {
            const today = new Date();
            const past30 = new Date();
            past30.setDate(today.getDate() - 30);
            
            startDateInput.value = this.toLocalDateStr(past30);
            endDateInput.value = this.toLocalDateStr(today);

            // Escuchar cambios en las fechas personalizadas
            startDateInput.addEventListener('change', () => {
                console.log(`Analytics: Fecha inicio personalizada cambiada a: ${startDateInput.value}`);
                this.updateCharts();
            });
            endDateInput.addEventListener('change', () => {
                console.log(`Analytics: Fecha fin personalizada cambiada a: ${endDateInput.value}`);
                this.updateCharts();
            });
        }

        // Renderizar los gráficos inicialmente
        this.renderKPIs();
        this.renderComparisonPanel();
        this.renderPredictivePanel();
        this.renderExpensesChart();
        this.renderNetWorthChart();
        this.renderZbbRuleChart();
        this.renderBudgetProgress();
        
        // Escuchar cambios en el selector de filtro de tiempo
        const timeFilter = document.getElementById('analytics-time-filter');
        if (timeFilter) {
            if (timeFilter.value === 'custom') {
                customRangeContainer?.classList.remove('hidden');
            }
            timeFilter.addEventListener('change', () => {
                console.log(`Analytics: Filtro de rango temporal cambiado a: ${timeFilter.value}`);
                if (timeFilter.value === 'custom') {
                    customRangeContainer?.classList.remove('hidden');
                } else {
                    customRangeContainer?.classList.add('hidden');
                }
                this.updateCharts();
            });
        }

        // Escuchar clics sobre las tarjetas del menú de navegación de Estadísticas
        const menuContainer = document.getElementById('analytics-menu');
        if (menuContainer) {
            menuContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.analytics-menu-card');
                if (card) {
                    const targetId = card.getAttribute('data-target');
                    if (targetId) {
                        this.showSection(targetId);
                    }
                }
            });
        }

        // Registrar clic del botón Volver
        const backBtn = document.getElementById('analytics-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.showMenu();
            };
        }

        // Escuchar clics sobre las tarjetas KPI para abrir el modal explicativo
        const kpiContainer = document.getElementById('analytics-kpi-container');
        if (kpiContainer) {
            kpiContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.kpi-card');
                if (card) {
                    const kpiKey = card.getAttribute('data-kpi');
                    if (kpiKey) {
                        this.showKpiHelp(kpiKey);
                    }
                }
            });
        }

        // Escuchar clics sobre las tarjetas comparativas para abrir el modal explicativo
        const compareContainer = document.getElementById('analytics-compare-container');
        if (compareContainer) {
            compareContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.compare-card');
                if (card) {
                    const kpiKey = card.getAttribute('data-kpi');
                    if (kpiKey) {
                        this.showKpiHelp(kpiKey);
                    }
                }
            });
        }

        // Escuchar clics sobre las tarjetas del panel predictivo para abrir el modal explicativo
        const predictiveContainer = document.getElementById('analytics-predictive-container');
        if (predictiveContainer) {
            predictiveContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.compare-card');
                if (card) {
                    const kpiKey = card.getAttribute('data-kpi');
                    if (kpiKey) {
                        this.showKpiHelp(kpiKey);
                    }
                }
            });
        }

        // Registrar descargas de informes
        const exportXlsxBtn = document.getElementById('export-xlsx-btn');
        if (exportXlsxBtn) {
            exportXlsxBtn.onclick = () => {
                const { startDate, endDate } = this.getFilterDates();
                ExportService.exportToExcel(startDate, endDate);
            };
        }

        const exportDocxBtn = document.getElementById('export-docx-btn');
        if (exportDocxBtn) {
            exportDocxBtn.onclick = () => {
                const { startDate, endDate } = this.getFilterDates();
                ExportService.exportToWord(startDate, endDate);
            };
        }

        // Registrar cierre del modal explicativo de KPIs
        const closeKpiBtn = document.getElementById('close-kpi-info-modal');
        const okKpiBtn = document.getElementById('kpi-info-ok-btn');
        if (closeKpiBtn) {
            closeKpiBtn.onclick = () => {
                document.getElementById('kpi-info-modal')?.classList.add('hidden');
            };
        }
        if (okKpiBtn) {
            okKpiBtn.onclick = () => {
                document.getElementById('kpi-info-modal')?.classList.add('hidden');
            };
        }
        
        // Iniciar ocultando las secciones de forma predeterminada (mostrando solo el menú)
        this.showMenu();

        // Suscribirse a cambios para actualizar gráficos automáticamente
        State.subscribe(() => {
            this.updateCharts();
        });
    },

    showKpiHelp(kpiKey) {
        const modal = document.getElementById('kpi-info-modal');
        const titleElem = document.getElementById('kpi-info-title');
        const descElem = document.getElementById('kpi-info-description');
        const formulaElem = document.getElementById('kpi-info-formula');
        const formulaDescElem = document.getElementById('kpi-info-formula-desc');
        const interpretationElem = document.getElementById('kpi-info-interpretation');

        if (!modal) return;

        let title = '';
        let description = '';
        let formula = '';
        let formulaDesc = '';
        let interpretationItems = [];

        if (kpiKey === 'savings') {
            title = '<i class="fas fa-info-circle"></i> Tasa de Ahorro Neto';
            description = 'Mide el porcentaje de tus ingresos reales que logras retener y no gastar en el periodo seleccionado. En finanzas personales es el termómetro número uno para evaluar tu capacidad de ahorro, mientras que en finanzas de negocios representa tu margen operativo neto o tasa de retención de utilidades.';
            formula = 'Tasa = ((Ingresos - Gastos) / Ingresos) × 100';
            formulaDesc = 'Se calcula restando los gastos totales de los ingresos reales del periodo (obteniendo el flujo neto), y dividiendo ese resultado entre el total de ingresos. El valor resultante se expresa como porcentaje.';
            interpretationItems = [
                '<li><strong>Mayor a 20% (Verde - Nivel Ideal)</strong>: Excelente salud financiera. Estás acumulando excedentes que puedes destinar a inversiones, fondos de emergencia o pago acelerado de deudas.</li>',
                '<li><strong>De 0% a 20% (Dorado - Nivel Aceptable)</strong>: Progreso positivo. Estás viviendo por debajo de tus posibilidades, pero tienes margen para reducir gastos hormiga u optimizar tu presupuesto para aumentar tu capacidad de ahorro.</li>',
                '<li><strong>Menor a 0% (Rojo - Déficit)</strong>: Alerta financiera. Tus gastos superan tus ingresos, lo que indica que estás consumiendo tus reservas anteriores (desahorrando) o endeudándote.</li>'
            ];
        } else if (kpiKey === 'flow') {
            title = '<i class="fas fa-info-circle"></i> Flujo Neto del Periodo';
            description = 'Representa la diferencia absoluta real entre todo el dinero que ingresó a tus cuentas y todo el dinero que egresó a través de gastos durante el periodo seleccionado. Es el saldo "en efectivo" resultante que se sumó o restó a tus fondos.';
            formula = 'Flujo Neto = Ingresos Totales - Gastos Totales';
            formulaDesc = 'Es la resta directa entre los ingresos netos del periodo y todos los gastos de consumo registrados (se excluyen las transferencias entre tus propias cuentas).';
            interpretationItems = [
                '<li><strong>Flujo Positivo (Verde - Superávit)</strong>: Tu patrimonio neto ha crecido. Tienes más dinero disponible en caja al final del periodo del que tenías al principio.</li>',
                '<li><strong>Flujo Negativo (Rojo - Déficit)</strong>: Tu efectivo neto ha disminuido. Tus cuentas han perdido balance para financiar los gastos del periodo.</li>',
                '<li><strong>Flujo Cero (Punto de Equilibrio)</strong>: Has gastado exactamente lo mismo que has ingresado. No hay pérdida de reservas, pero tampoco hay crecimiento patrimonial.</li>'
            ];
        } else if (kpiKey === 'runway') {
            title = '<i class="fas fa-info-circle"></i> Runway (Meses de Caja)';
            description = 'Mide cuántos meses de supervivencia financiera tienes garantizados al ritmo de gasto actual, utilizando exclusivamente tu efectivo líquido (el saldo disponible sumado en tus cuentas corrientes y de ahorro, sin contar deudas ni tarjetas). Es una métrica crítica de seguridad para imprevistos personales y solidez en negocios.';
            formula = 'Runway = Efectivo Disponible / Burn Rate Neto Mensual';
            formulaDesc = 'Se calcula dividiendo el saldo consolidado actual de tus cuentas líquidas (ahorros/corriente) entre el déficit neto mensualizado del periodo actual (Burn Rate).';
            interpretationItems = [
                '<li><strong>Sostenible (Verde - Flujo Positivo)</strong>: Tus ingresos superan tus gastos. Tus reservas líquidas están aumentando, por lo que tu runway es virtualmente ilimitado.</li>',
                '<li><strong>Mayor a 6 meses (Verde - Seguro)</strong>: Nivel muy saludable. Tienes un fondo de emergencia robusto para afrontar imprevistos graves o caídas drásticas de ingresos.</li>',
                '<li><strong>De 3 a 6 meses (Dorado - Precaución)</strong>: Margen de maniobra aceptable, pero se recomienda recortar gastos no esenciales para robustecer la reserva.</li>',
                '<li><strong>Menor a 3 meses (Rojo - Alerta Crítica)</strong>: Riesgo inminente. Tus reservas líquidas están próximas a agotarse bajo el ritmo actual de pérdidas. Requiere acción inmediata (aumentar ingresos o recortar costos).</li>'
            ];
        } else if (kpiKey === 'compare-income') {
            title = '<i class="fas fa-info-circle"></i> Comparativa de Ingresos';
            description = 'Evalúa la variación porcentual de todas tus entradas de dinero real en el periodo filtrado actual comparado contra el periodo inmediatamente previo (MoM) y el mismo periodo del año pasado (YoY). Permite analizar el crecimiento y solidez de tus ingresos.';
            formula = 'Variación % = ((Ingresos Act. - Ingresos Ant.) / Ingresos Ant.) × 100';
            formulaDesc = 'Se divide la diferencia neta de ingresos entre el valor de ingresos del periodo anterior y se multiplica por 100 para obtener el porcentaje de cambio.';
            interpretationItems = [
                '<li><strong>Variación Positiva (Verde)</strong>: Tus ingresos han aumentado, indicando crecimiento financiero o incremento de actividad en tus fuentes de ingresos.</li>',
                '<li><strong>Variación Negativa (Rojo)</strong>: Tus ingresos han disminuido frente al periodo anterior. Considera revisar si hay estacionalidad o pérdida de clientes/flujos de caja.</li>'
            ];
        } else if (kpiKey === 'compare-expenses') {
            title = '<i class="fas fa-info-circle"></i> Comparativa de Gastos';
            description = 'Mide el comportamiento de tus egresos por consumo u operaciones. Te permite detectar desvíos presupuestarios o incrementos no justificados del estilo de vida frente a periodos previos.';
            formula = 'Variación % = ((Gastos Act. - Gastos Ant.) / Gastos Ant.) × 100';
            formulaDesc = 'Calcula la variación porcentual de tus egresos comparando el total de gastos actual contra los anteriores.';
            interpretationItems = [
                '<li><strong>Variación Negativa (Verde)</strong>: Has gastado menos dinero, lo cual refleja eficiencia y buen control del presupuesto.</li>',
                '<li><strong>Variación Positiva (Rojo)</strong>: Has gastado más dinero. Evalúa si corresponde a egresos excepcionales planificados o desajustes inflacionarios/gastos hormiga.</li>'
            ];
        } else if (kpiKey === 'compare-flow') {
            title = '<i class="fas fa-info-circle"></i> Comparativa de Flujo Neto';
            description = 'Analiza la variación absoluta de tu excedente o caja física acumulada (Ingresos - Gastos). Te muestra si tu balance neto ha ganado o perdido fuerza financiera.';
            formula = 'Variación Absoluta = Flujo Neto Actual - Flujo Neto Anterior';
            formulaDesc = 'Resta directa entre el Flujo Neto del periodo actual y el Flujo Neto del periodo de comparación (MoM o YoY).';
            interpretationItems = [
                '<li><strong>Variación Positiva (Verde)</strong>: Has incrementado tu ritmo de capitalización. Tu capacidad de ahorro o excedente operativo creció en comparación con el periodo pasado.</li>',
                '<li><strong>Variación Negativa (Rojo)</strong>: Tu excedente financiero se redujo o tus pérdidas netas aumentaron en relación con periodos anteriores.</li>'
            ];
        } else if (kpiKey === 'compare-savings') {
            title = '<i class="fas fa-info-circle"></i> Comparativa de Tasa de Ahorro';
            description = 'Mide el cambio proporcional en tu capacidad de retención (el porcentaje de ingresos que logras no gastar) frente a periodos pasados, medido en puntos porcentuales (p.p.).';
            formula = 'Variación p.p. = Tasa de Ahorro Act. (%) - Tasa de Ahorro Ant. (%)';
            formulaDesc = 'Diferencia aritmética simple entre el porcentaje de la Tasa de Ahorro actual y el de la tasa del periodo de comparación.';
            interpretationItems = [
                '<li><strong>Variación Positiva (Verde)</strong>: Estás reteniendo una mayor proporción de tus ingresos, mejorando tu eficiencia de ahorro.</li>',
                '<li><strong>Variación Negativa (Rojo)</strong>: Tu eficiencia cayó. Estás gastando un mayor porcentaje de tus ingresos totales.</li>'
            ];
        } else if (kpiKey === 'predict-forecast') {
            title = '<i class="fa-solid fa-wand-magic-sparkles"></i> Pronóstico de Gastos';
            description = 'Muestra el valor ponderado proyectado de tus gastos totales para el próximo mes. Utiliza una Media Móvil Ponderada (WMA) de 3 meses para priorizar los hábitos y costos de vida más recientes.';
            formula = 'WMA = (M_1 × 3 + M_2 × 2 + M_3 × 1) / 6';
            formulaDesc = 'Multiplica los gastos del mes más reciente por 3, los del anterior por 2, y los del tras anterior por 1; suma los resultados y divide por 6.';
            interpretationItems = [
                '<li><strong>Ponderación Reciente</strong>: Al dar mayor peso al mes más cercano, el modelo responde rápidamente a cambios inflacionarios, gastos fijos nuevos o hábitos de consumo recientes.</li>',
                '<li><strong>Planificación</strong>: Sirve como meta presupuestaria límite. Úsalo para planificar tu flujo de efectivo antes de que inicie el mes.</li>'
            ];
        } else if (kpiKey === 'predict-range') {
            title = '<i class="fa-solid fa-arrows-left-right"></i> Rango de Gasto Esperado';
            description = 'Establece un intervalo de confianza estadístico de probabilidad para tus gastos, considerando el pronóstico base y la volatilidad real e histórica en tus gastos mensuales.';
            formula = 'Rango = Pronóstico ± Desviación Estándar (σ)';
            formulaDesc = 'Suma y resta una desviación estándar histórica de gastos al pronóstico calculado, definiendo un rango esperado de consumo.';
            interpretationItems = [
                '<li><strong>Rango Amplio (Volatilidad Alta)</strong>: Si tu consumo varía bruscamente mes a mes, el rango será amplio. Esto indica la presencia de gastos extraordinarios o presupuestos inestables.</li>',
                '<li><strong>Rango Estrecho (Volatilidad Baja)</strong>: Indica gastos muy estables y controlados. Tus salidas de caja son predecibles y fáciles de presupuestar.</li>'
            ];
        }

        if (titleElem) titleElem.innerHTML = title;
        if (descElem) descElem.textContent = description;
        if (formulaElem) formulaElem.textContent = formula;
        if (formulaDescElem) formulaDescElem.textContent = formulaDesc;
        if (interpretationElem) interpretationElem.innerHTML = interpretationItems.join('');

        modal.classList.remove('hidden');
    },

    updateCharts() {
        if (this.charts.expenses) this.charts.expenses.destroy();
        if (this.charts.netWorth) this.charts.netWorth.destroy();
        if (this.charts.zbbRule) this.charts.zbbRule.destroy();
        this.renderKPIs();
        this.renderComparisonPanel();
        this.renderPredictivePanel();
        this.renderDebtSimulator();
        this.renderSplitBill();
        this.renderExpensesChart();
        this.renderNetWorthChart();
        this.renderZbbRuleChart();
        this.renderBudgetProgress();

        // Restaurar estado de visibilidad del panel seleccionado
        if (this.activeSection) {
            this.showSection(this.activeSection);
        } else {
            this.showMenu();
        }
    },

    renderExpensesChart() {
        const ctx = document.getElementById('expenses-chart');
        if (!ctx) return;

        const { transactions, categories, accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};

        const { startDate, endDate } = this.getFilterDates();
        const filteredTx = transactions.filter(tx => {
            const comp = getLocalDateComponents(tx.date);
            if (!comp) return false;
            const txDate = new Date(comp.year, comp.month, comp.day);
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });

        // Calcular pérdida cambiaria y comisiones en transferencias en el rango
        let totalTransferLoss = 0;
        filteredTx.forEach(tx => {
            if (tx.type === 'transfer') {
                let fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                if (!fromAcc && tx.from_profile_id && State.profilesState && State.profilesState.profiles) {
                    const sourceProfile = State.profilesState.profiles.find(p => String(p.id) === String(tx.from_profile_id));
                    if (sourceProfile) {
                        fromAcc = sourceProfile.db.accounts.find(a => String(a.id) === String(tx.from_account_id));
                    }
                }
                
                let toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                if (!toAcc && tx.to_profile_id && State.profilesState && State.profilesState.profiles) {
                    const targetProfile = State.profilesState.profiles.find(p => String(p.id) === String(tx.to_profile_id));
                    if (targetProfile) {
                        toAcc = targetProfile.db.accounts.find(a => String(a.id) === String(tx.to_account_id));
                    }
                }
                
                const rateFrom = fromAcc ? (rates[fromAcc.currency] || 1) : 1;
                const rateTo = toAcc ? (rates[toAcc.currency] || 1) : 1;
                
                const extractedInBase = parseFloat(tx.amount_extracted || 0) / rateFrom;
                const receivedInBase = parseFloat(tx.amount_received || 0) / rateTo;
                
                const diff = extractedInBase - receivedInBase;
                if (diff > 0.01) {
                    totalTransferLoss += diff;
                }
            }
        });
        
        // Agrupar por categoría solo si son de tipo 'expense' (con conversión de divisa)
        const categoryTotals = {};
        filteredTx.forEach(tx => {
            const cat = categories.find(c => String(c.id) === String(tx.category_id));
            if (cat && cat.type === 'expense') {
                const name = cat.name;
                
                // Obtener la cuenta para ver su moneda
                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                const currency = acc ? acc.currency : baseCurrency;
                
                // Convertir monto a moneda base
                const rate = rates[currency] || 1;
                const amountInBase = parseFloat(tx.amount || 0) / rate;
                
                categoryTotals[name] = (categoryTotals[name] || 0) + amountInBase;
            }
        });

        const labels = Object.keys(categoryTotals);
        const data = Object.values(categoryTotals);
        const colors = labels.map(name => {
            const cat = categories.find(c => c.name === name);
            return cat ? cat.visual_color : '#ccc';
        });

        const legendElem = document.getElementById('expenses-chart-legend');
        const detailWidgetElem = document.getElementById('expenses-detail-widget');

        if (labels.length === 0) {
            this.charts.expenses = null;
            if (legendElem) legendElem.innerHTML = '<div class="empty-state" style="padding: 20px 0;">No se registraron egresos en este período.</div>';
            if (detailWidgetElem) detailWidgetElem.style.display = 'none';
            
            const lossContainer = document.getElementById('expenses-transfer-loss-container');
            if (lossContainer) {
                if (totalTransferLoss > 0.01) {
                    lossContainer.innerHTML = `
                        <div style="border: 2px solid var(--text-primary); background-color: var(--bg-card); padding: 12px 18px; border-radius: 6px; box-shadow: 2px 2px 0px var(--text-primary); display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: #B23A1E;">
                            <i class="fa-solid fa-right-left" style="font-size: 1.1rem; flex-shrink: 0;"></i>
                            <span><strong>Costo por Conversión/Comisión en Transferencias:</strong> $${totalTransferLoss.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}</span>
                        </div>
                    `;
                    lossContainer.style.display = 'block';
                } else {
                    lossContainer.style.display = 'none';
                }
            }
            return;
        }

        const totalExpenses = data.reduce((a, b) => a + b, 0);

        // Auxiliar para inyectar y animar el widget de desglose
        const showDesgloseDetail = (item) => {
            if (!detailWidgetElem) return;
            
            detailWidgetElem.style.display = 'block';
            detailWidgetElem.style.opacity = '0';
            detailWidgetElem.style.transform = 'translateY(5px)';
            
            setTimeout(() => {
                detailWidgetElem.style.opacity = '1';
                detailWidgetElem.style.transform = 'translateY(0)';
            }, 50);
            
            detailWidgetElem.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            
            detailWidgetElem.innerHTML = `
                <div class="stat-card" style="border-left: 6px solid ${item.color}; background-color: var(--bg-card); display: flex; flex-direction: column; gap: 8px; margin-bottom: 5px; width: 100%;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">
                            Desglose de Categoría
                        </span>
                        <span class="greeting" style="font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; background-color: ${item.color}22; color: ${item.color}; font-weight: bold;">
                            ${item.pct.toFixed(1)}% del total
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 5px;">
                        <h2 style="font-family: var(--font-heading); font-size: 1.5rem; margin: 0; display: inline-flex; align-items: center; gap: 8px; font-weight: 700;">
                            <i class="fas ${item.icon.startsWith('fa-') ? item.icon : 'fa-' + item.icon}" style="color: ${item.color}; font-size: 1.15rem;"></i>
                            ${item.name}
                        </h2>
                        <h2 style="font-family: var(--font-heading); font-size: 1.7rem; margin: 0; font-weight: bold; color: var(--action-expense);">
                            $${item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} <span style="font-size: 0.85rem; font-family: var(--font-body); font-weight: normal; color: var(--text-secondary);">${baseCurrency}</span>
                        </h2>
                    </div>
                    <p style="margin-top: 5px; font-size: 0.85rem; color: var(--text-secondary); font-style: italic; border-left: 2px solid ${item.color}; padding-left: 8px; line-height: 1.4;">
                        En este período filtrado, tus egresos por <strong>${item.name}</strong> representan el <strong>${item.pct.toFixed(1)}%</strong> de tus gastos totales. Toca otra categoría para comparar su comportamiento.
                    </p>
                </div>
            `;
        };

        // Inyectar estado inicial del widget instructivo
        if (detailWidgetElem) {
            detailWidgetElem.style.display = 'block';
            detailWidgetElem.innerHTML = `
                <div style="padding: 15px; border: 2px dashed var(--text-secondary); border-radius: 4px 8px 3px 6px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; font-style: italic; background-color: rgba(0,0,0,0.015);">
                    <i class="fas fa-hand-pointer" style="margin-right: 5px; animation: pulse 2s infinite;"></i> 
                    Toca una categoría en la lista o una sección de la dona para visualizar el importe total exacto de este período.
                </div>
            `;
        }

        // Renderizar la leyenda HTML premium interactiva
        if (legendElem) {
            legendElem.innerHTML = '';
            
            const categoriesList = labels.map((name, i) => {
                const cat = categories.find(c => c.name === name);
                const amount = data[i];
                const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                return {
                    name,
                    amount,
                    pct,
                    color: colors[i],
                    icon: cat ? cat.icon || 'fa-tag' : 'fa-tag',
                    index: i
                };
            }).sort((a, b) => b.amount - a.amount); // Ordenar de mayor a menor gasto
            
            categoriesList.forEach(item => {
                const row = document.createElement('div');
                row.className = 'zbb-cat-item';
                row.style.cursor = 'pointer';
                row.style.padding = '8px 12px';
                row.style.margin = '4px 0';
                row.style.borderRadius = '4px 8px 3px 6px';
                row.style.transition = 'all 0.2s ease';
                row.style.border = '1px solid transparent';
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                
                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background-color: ${item.color}; color: #FFF; font-size: 0.8rem; border: 1px solid var(--text-primary);">
                            <i class="fas ${item.icon.startsWith('fa-') ? item.icon : 'fa-' + item.icon}"></i>
                        </span>
                        <strong style="font-size: 0.95rem;">${item.name}</strong>
                    </div>
                    <span style="font-weight: bold; font-size: 0.9rem; color: var(--text-primary);">${item.pct.toFixed(1)}%</span>
                `;
                
                row.addEventListener('mouseenter', () => {
                    row.style.backgroundColor = 'var(--bg-primary)';
                    row.style.border = '1px dashed var(--text-secondary)';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.backgroundColor = 'transparent';
                    row.style.border = '1px solid transparent';
                });
                
                row.addEventListener('click', () => {
                    showDesgloseDetail(item);
                    
                    // Resaltar rebanada en Chart.js
                    if (this.charts.expenses) {
                        const chart = this.charts.expenses;
                        const originalIdx = labels.indexOf(item.name);
                        if (originalIdx !== -1) {
                            chart.setActiveElements([{ datasetIndex: 0, index: originalIdx }]);
                            chart.tooltip.setActiveElements([{ datasetIndex: 0, index: originalIdx }], { x: 0, y: 0 });
                            chart.update();
                        }
                    }
                });
                
                legendElem.appendChild(row);
            });
        }

        this.charts.expenses = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data.map(v => parseFloat(v.toFixed(2))),
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const activeEl = activeElements[0];
                        const idx = activeEl.index;
                        const categoryName = labels[idx];
                        const cat = categories.find(c => c.name === categoryName);
                        const amount = data[idx];
                        const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                        
                        showDesgloseDetail({
                            name: categoryName,
                            amount: amount,
                            pct: pct,
                            color: colors[idx],
                            icon: cat ? cat.icon || 'fa-tag' : 'fa-tag'
                        });
                    }
                },
                plugins: {
                    legend: {
                        display: false // Desactivar la leyenda automática para usar la leyenda interactiva HTML
                    },
                    title: {
                        display: true,
                        text: `Distribución de Gastos (en ${baseCurrency})`,
                        color: '#2B2B2B',
                        font: { family: 'Cormorant Garamond', size: 18, weight: 'bold' }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                const pct = totalExpenses > 0 ? ((val / totalExpenses) * 100).toFixed(1) : 0;
                                return ` ${context.label}: $${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });

        // Inyectar o limpiar costo de transferencia/conversión en el DOM
        const lossContainer = document.getElementById('expenses-transfer-loss-container') || (() => {
            const div = document.createElement('div');
            div.id = 'expenses-transfer-loss-container';
            div.style.marginTop = '15px';
            detailWidgetElem.parentNode.appendChild(div);
            return div;
        })();

        if (totalTransferLoss > 0.01) {
            lossContainer.innerHTML = `
                <div style="border: 2px solid var(--text-primary); background-color: var(--bg-card); padding: 12px 18px; border-radius: 6px; box-shadow: 2px 2px 0px var(--text-primary); display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: #B23A1E;">
                    <i class="fa-solid fa-right-left" style="font-size: 1.1rem; flex-shrink: 0;"></i>
                    <span><strong>Costo por Conversión/Comisión en Transferencias:</strong> $${totalTransferLoss.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}</span>
                </div>
            `;
            lossContainer.style.display = 'block';
        } else {
            lossContainer.style.display = 'none';
        }
    },

    renderNetWorthChart() {
        const ctx = document.getElementById('net-worth-history-chart');
        if (!ctx) return;

        const { accounts, settings, transactions, categories } = State.db;
        const baseCurrency = settings.baseCurrency || 'USD';
        const rates = settings.exchangeRates || {};

        if (accounts.length === 0) return;

        // Auxiliar para formatear fecha Date local a YYYY-MM-DD
        const toLocalDateStr = (dObj) => {
            const yyyy = dObj.getFullYear();
            const mm = String(dObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dObj.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        // Auxiliar para formatear YYYY-MM-DD a DD/MM/AAAA para tooltips de alta definición
        const toReadableDateStr = (dateStr) => {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            return dateStr;
        };

        // 1. Obtener la fecha de inicio del rango temporal
        const { startDate: sDate, endDate: eDate } = this.getFilterDates();
        const now = new Date();
        const todayStr = toLocalDateStr(now);
        let startDate = sDate;
        let endDate = eDate || now;

        if (!startDate) {
            // Para 'all', buscamos la fecha de la transacción más antigua en el historial de forma robusta
            if (transactions.length > 0) {
                let oldestStr = standardizeDate(transactions[0].date);
                transactions.forEach(tx => {
                    const s = standardizeDate(tx.date);
                    if (s < oldestStr) oldestStr = s;
                });
                const comp = getLocalDateComponents(oldestStr);
                startDate = new Date(comp.year, comp.month, comp.day);
            } else {
                startDate = new Date();
                startDate.setDate(endDate.getDate() - 29); // Fallback a 30 días antes de endDate
            }
        }

        // Generar lista continua de fechas locales YYYY-MM-DD en el rango
        const dateRange = [];
        let tempD = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endLocalDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        while (tempD <= endLocalDate) {
            dateRange.push(toLocalDateStr(tempD));
            tempD.setDate(tempD.getDate() + 1);
        }

        // 2. Calcular el patrimonio neto actual real (a fecha de hoy) de forma consistente con UI.renderNetWorth
        let assets = 0;
        let liabilities = 0;
        accounts.forEach(acc => {
            const rate = rates[acc.currency] || 1;
            const safeRate = (rate && rate > 0) ? rate : 1;
            const balanceInBase = (acc.balance || 0) / safeRate;
            if (acc.type === 'debt' || acc.type === 'liability') {
                liabilities += Math.abs(balanceInBase);
            } else {
                assets += balanceInBase;
            }
        });
        let currentNW = assets - liabilities;

        // 3. Crear un mapa para guardar el patrimonio al CIERRE de cada fecha en el rango
        const dailyNWMap = {};
        dailyNWMap[todayStr] = currentNW;

        // Ordenar TODAS las transacciones del historial de más nuevas a más antiguas para la reversión retrospectiva
        const sortedTxDesc = [...transactions].sort((a, b) => {
            const dateA = standardizeDate(a.date);
            const dateB = standardizeDate(b.date);
            const dateComp = dateB.localeCompare(dateA);
            if (dateComp !== 0) return dateComp;
            return (parseFloat(b.id) || 0) - (parseFloat(a.id) || 0);
        });

        // Puntero para llevar el control de la fecha activa que estamos procesando hacia atrás
        let activeDateStr = todayStr;

        sortedTxDesc.forEach(tx => {
            const txDateStr = standardizeDate(tx.date);
            
            // Si la transacción ocurre en el futuro o después de hoy por inconsistencias, la tratamos como hoy
            const effectiveTxDateStr = txDateStr > todayStr ? todayStr : txDateStr;
            
            // Rellenar los días intermedios entre la última fecha activa y la fecha de la transacción actual
            while (activeDateStr > effectiveTxDateStr) {
                const comp = getLocalDateComponents(activeDateStr);
                const activeDate = new Date(comp.year, comp.month, comp.day);
                activeDate.setDate(activeDate.getDate() - 1);
                activeDateStr = toLocalDateStr(activeDate);
                
                // El saldo al cierre de este día intermedio es el currentNW acumulado hasta ahora
                if (dateRange.includes(activeDateStr)) {
                    dailyNWMap[activeDateStr] = currentNW;
                }
            }
            
            // Revertir el efecto de la transacción sobre currentNW
            if (tx.type === 'transfer') {
                if (tx.to_profile_id) {
                    // Salida a otro perfil: este perfil perdió extractedInBase
                    const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                    const rateFrom = fromAcc ? (rates[fromAcc.currency] || 1) : 1;
                    const extractedInBase = (parseFloat(tx.amount_extracted) || 0) / rateFrom;
                    currentNW += extractedInBase;
                } else if (tx.from_profile_id) {
                    // Entrada desde otro perfil: este perfil recibió receivedInBase
                    const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                    const rateTo = toAcc ? (rates[toAcc.currency] || 1) : 1;
                    const receivedInBase = (parseFloat(tx.amount_received) || 0) / rateTo;
                    currentNW -= receivedInBase;
                } else {
                    // Transferencia local interna
                    const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                    const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                    const rateFrom = fromAcc ? (rates[fromAcc.currency] || 1) : 1;
                    const rateTo = toAcc ? (rates[toAcc.currency] || 1) : 1;
                    
                    const extractedInBase = (parseFloat(tx.amount_extracted) || 0) / rateFrom;
                    const receivedInBase = (parseFloat(tx.amount_received) || 0) / rateTo;
                    
                    currentNW = currentNW + extractedInBase - receivedInBase;
                }
            } else {
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                const currency = acc ? acc.currency : baseCurrency;
                const rate = rates[currency] || 1;
                const amountInBase = (parseFloat(tx.amount) || 0) / rate;
                
                if (cat) {
                    if (cat.type === 'income') {
                        currentNW -= amountInBase;
                    } else if (cat.type === 'expense') {
                        currentNW += amountInBase;
                    }
                }
            }
            
            // Guardamos el saldo consolidado justo después de revertir esta transacción
            if (dateRange.includes(effectiveTxDateStr)) {
                dailyNWMap[effectiveTxDateStr] = currentNW;
            }
        });

        // Rellenar cualquier fecha restante al inicio de la lista del rango
        while (activeDateStr > dateRange[0]) {
            const comp = getLocalDateComponents(activeDateStr);
            const activeDate = new Date(comp.year, comp.month, comp.day);
            activeDate.setDate(activeDate.getDate() - 1);
            activeDateStr = toLocalDateStr(activeDate);
            if (dateRange.includes(activeDateStr)) {
                dailyNWMap[activeDateStr] = currentNW;
            }
        }

        // Asegurarse de que todas las fechas del rango tengan un saldo consolidado asignado
        dateRange.forEach(dateStr => {
            if (dailyNWMap[dateStr] === undefined) {
                // Buscar el saldo más cercano hacia adelante (futuro)
                const compStr = getLocalDateComponents(dateStr);
                let checkDate = new Date(compStr.year, compStr.month, compStr.day);
                let found = false;
                while (checkDate <= now) {
                    const checkStr = toLocalDateStr(checkDate);
                    if (dailyNWMap[checkStr] !== undefined) {
                        dailyNWMap[dateStr] = dailyNWMap[checkStr];
                        found = true;
                        break;
                    }
                    checkDate.setDate(checkDate.getDate() + 1);
                }
                if (!found) {
                    dailyNWMap[dateStr] = currentNW;
                }
            }
        });

        // 4. Convertir mapa de saldos a lista de puntos ordenada cronológicamente
        const historyData = dateRange.map(dateStr => {
            return {
                x: toReadableDateStr(dateStr),
                y: parseFloat(dailyNWMap[dateStr].toFixed(2))
            };
        });

        // 5. Calcular línea de tendencia sutil (Regresión Lineal por Mínimos Cuadrados)
        const trendData = [];
        const n = historyData.length;
        if (n > 1) {
            let sumX = 0;
            let sumY = 0;
            let sumXY = 0;
            let sumX2 = 0;
            
            for (let i = 0; i < n; i++) {
                sumX += i;
                sumY += historyData[i].y;
                sumXY += i * historyData[i].y;
                sumX2 += i * i;
            }
            
            const denominator = (n * sumX2 - sumX * sumX);
            const m = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
            const c = (sumY - m * sumX) / n;
            
            for (let i = 0; i < n; i++) {
                trendData.push({
                    x: historyData[i].x,
                    y: parseFloat((m * i + c).toFixed(2))
                });
            }
        }

        // Obtener color temático dinámico del perfil activo
        const profileColor = State.activeProfile ? State.activeProfile.color : '#8C9970';

        this.charts.netWorth = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: `Patrimonio Neto (${baseCurrency})`,
                        data: historyData,
                        borderColor: profileColor,
                        backgroundColor: profileColor + '26', // Relleno con opacidad
                        fill: 'start',
                        tension: 0.2, // Curvatura fluida premium
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointBackgroundColor: profileColor,
                        pointBorderColor: '#FFF',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Tendencia',
                        data: trendData,
                        borderColor: '#7A6A53', // Color neutro sutil
                        borderWidth: 1.5,
                        borderDash: [6, 6], // Recta discontinua sutil elegante
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        grid: { display: false },
                        ticks: {
                            color: '#7A6A53',
                            font: { family: 'Inconsolata', size: 10, weight: 'bold' },
                            maxTicksLimit: 7, // Limitar para evitar saturación en pantallas móviles o de baja resolución
                            maxRotation: 0, // Forzar visualización horizontal ultra limpia
                            minRotation: 0,
                            callback: function(val, index) {
                                const label = this.getLabelForValue(val);
                                if (!label) return '';
                                // Abreviar el eje a DD/MM para máxima legibilidad
                                return label.substring(0, 5);
                            }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            color: '#7A6A53',
                            font: { family: 'Inconsolata', size: 11 },
                            callback: (val) => {
                                const formatted = Math.abs(val).toLocaleString('es-ES');
                                return val < 0 ? `-$${formatted}` : `$${formatted}`;
                            }
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                // Devolver la fecha completa DD/MM/AAAA para el título del tooltip
                                return context[0].label;
                            },
                            label: (context) => {
                                const val = context.raw.y;
                                if (context.datasetIndex === 1) {
                                    return ` Tendencia: $${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency}`;
                                }
                                return ` Patrimonio: $${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency}`;
                            }
                        }
                    }
                }
            }
        });
    },

    renderZbbRuleChart() {
        const ctx = document.getElementById('zbb-rule-chart');
        const legendElem = document.getElementById('zbb-rule-legend');
        if (!ctx || !legendElem) return;

        const { transactions, categories, accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};
        
        const { startDate, endDate } = this.getFilterDates();
        const filteredTx = transactions.filter(tx => {
            const comp = getLocalDateComponents(tx.date);
            if (!comp) return false;
            const txDate = new Date(comp.year, comp.month, comp.day);
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });
        
        let totalIncomeReal = 0;
        let totalNeeds = 0;
        let totalWants = 0;
        let totalSavings = 0;
        let totalTransferLoss = 0; // Pérdida cambiaria y comisiones en transferencias
        
        // Calcular pérdida cambiaria y comisiones en transferencias en el rango
        filteredTx.forEach(tx => {
            if (tx.type === 'transfer') {
                let fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                if (!fromAcc && tx.from_profile_id && State.profilesState && State.profilesState.profiles) {
                    const sourceProfile = State.profilesState.profiles.find(p => String(p.id) === String(tx.from_profile_id));
                    if (sourceProfile) {
                        fromAcc = sourceProfile.db.accounts.find(a => String(a.id) === String(tx.from_account_id));
                    }
                }
                
                let toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                if (!toAcc && tx.to_profile_id && State.profilesState && State.profilesState.profiles) {
                    const targetProfile = State.profilesState.profiles.find(p => String(p.id) === String(tx.to_profile_id));
                    if (targetProfile) {
                        toAcc = targetProfile.db.accounts.find(a => String(a.id) === String(tx.to_account_id));
                    }
                }
                
                const rateFrom = fromAcc ? (rates[fromAcc.currency] || 1) : 1;
                const rateTo = toAcc ? (rates[toAcc.currency] || 1) : 1;
                
                const extractedInBase = parseFloat(tx.amount_extracted || 0) / rateFrom;
                const receivedInBase = parseFloat(tx.amount_received || 0) / rateTo;
                
                const diff = extractedInBase - receivedInBase;
                if (diff > 0.01) {
                    totalTransferLoss += diff;
                }
            }
        });
        
        // 1. Sumar ingresos reales y gastos en categorías (Necesidades y Deseos)
        filteredTx.forEach(tx => {
            if (tx.type !== 'transfer') {
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                if (cat) {
                    const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                    const currency = acc ? acc.currency : baseCurrency;
                    const rate = rates[currency] || 1;
                    const amountInBase = parseFloat(tx.amount || 0) / rate;
                    
                    if (cat.type === 'income') {
                        totalIncomeReal += amountInBase;
                    } else if (cat.type === 'expense') {
                        if (cat.subtype === 'variable') {
                            totalWants += amountInBase;
                        } else { // fixed
                            totalNeeds += amountInBase;
                        }
                    }
                }
            }
        });

        // 2. Calcular flujo neto agregado de las cuentas de Ahorro y Deuda (Futuros)
        const futureAccounts = accounts.filter(a => a.type === 'savings' || a.type === 'debt');
        futureAccounts.forEach(acc => {
            let accNetFlow = 0;
            filteredTx.forEach(tx => {
                if (tx.type === 'transfer') {
                    if (String(tx.to_account_id) === String(acc.id)) {
                        const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                        const rate = rates[toAcc ? toAcc.currency : baseCurrency] || 1;
                        accNetFlow += parseFloat(tx.amount_received || 0) / rate;
                    }
                    if (String(tx.from_account_id) === String(acc.id)) {
                        const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                        const rate = rates[fromAcc ? fromAcc.currency : baseCurrency] || 1;
                        accNetFlow -= parseFloat(tx.amount_extracted || 0) / rate;
                    }
                } else {
                    if (String(tx.account_id) === String(acc.id)) {
                        const cat = categories.find(c => String(c.id) === String(tx.category_id));
                        if (cat) {
                            const rate = rates[acc.currency] || 1;
                            const amountInBase = parseFloat(tx.amount || 0) / rate;
                            if (cat.type === 'income') {
                                accNetFlow += amountInBase;
                            } else if (cat.type === 'expense') {
                                accNetFlow -= amountInBase;
                            }
                        }
                    }
                }
            });
            // Si el flujo neto de la cuenta es positivo (hemos ahorrado o pagado deuda neta en el periodo), se suma a Futuros
            if (accNetFlow > 0) {
                totalSavings += accNetFlow;
            }
        });

        // Ingreso base para calcular la distribución
        const totalIncomeBase = totalIncomeReal > 0 ? totalIncomeReal : (totalNeeds + totalWants + totalSavings);
        
        const pctNeeds = totalIncomeBase > 0 ? (totalNeeds / totalIncomeBase) * 100 : 0;
        const pctWants = totalIncomeBase > 0 ? (totalWants / totalIncomeBase) * 100 : 0;
        const pctSavings = totalIncomeBase > 0 ? (totalSavings / totalIncomeBase) * 100 : 0;

        // Calcular Delta e Heurística de presupuesto
        const delta = totalIncomeBase - (totalNeeds + totalWants + totalSavings);
        
        let status = 'Maestría ZBB';
        let statusColor = '#005F56'; // Verde oscuro
        let suggestion = '¡Perfecto! Tienes cada unidad de tu capital asignada con maestría financiera extrema.';
        
        if (delta > 0.05) {
            status = 'Capital Ocioso';
            statusColor = '#DFB574'; // Dorado
            suggestion = `Tienes $${delta.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency} sin asignar en este período. Considera destinarlo a metas de Ahorro.`;
        } else if (delta < -0.05) {
            status = 'Sobreasignación';
            statusColor = '#B23A1E'; // Rojo
            suggestion = `Has asignado o gastado $${Math.abs(delta).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency} por encima de tus ingresos en este período. Ajusta tus Deseos (variables).`;
        }

        // Renderizar leyenda dinámica
        legendElem.innerHTML = `
            <div style="margin-bottom: 12px;">
                <span class="greeting" style="font-size: 1rem; padding: 4px 8px; border-radius: 4px; background-color: ${statusColor}22; color: ${statusColor}; font-weight: bold;">
                    Estado: ${status}
                </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                <div>
                    <strong>Necesidades (Ideal 50%):</strong> 
                    <span style="float: right;">${pctNeeds.toFixed(1)}% ($${totalNeeds.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${baseCurrency})</span>
                    <div style="height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden; margin-top: 3px;">
                        <div style="width: ${Math.min(100, pctNeeds)}%; height: 100%; background: #2B2B2B;"></div>
                    </div>
                </div>
                <div>
                    <strong>Deseos (Ideal 30%):</strong> 
                    <span style="float: right;">${pctWants.toFixed(1)}% ($${totalWants.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${baseCurrency})</span>
                    <div style="height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden; margin-top: 3px;">
                        <div style="width: ${Math.min(100, pctWants)}%; height: 100%; background: #D9A098;"></div>
                    </div>
                </div>
                <div>
                    <strong>Futuro (Ideal 20%):</strong> 
                    <span style="float: right;">${pctSavings.toFixed(1)}% ($${totalSavings.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${baseCurrency})</span>
                    <div style="height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden; margin-top: 3px;">
                        <div style="width: ${Math.min(100, pctSavings)}%; height: 100%; background: #A5BCA6;"></div>
                    </div>
                </div>
            </div>
            <p style="margin-top: 15px; font-size: 0.85rem; color: var(--text-secondary); font-style: italic; border-left: 2px solid ${statusColor}; padding-left: 8px;">
                ${suggestion}
            </p>
        `;

        // Si todos los valores son cero, no renderizar gráfico
        if (totalNeeds === 0 && totalWants === 0 && totalSavings === 0) {
            ctx.parentElement.innerHTML = '<div class="empty-state" style="padding: 40px 0;">Registra ingresos, gastos o transferencias para activar la regla 50/30/20</div>';
            return;
        }

        this.charts.zbbRule = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Necesidades', 'Deseos', 'Futuro'],
                datasets: [{
                    data: [
                        parseFloat(totalNeeds.toFixed(2)),
                        parseFloat(totalWants.toFixed(2)),
                        parseFloat(totalSavings.toFixed(2))
                    ],
                    backgroundColor: ['#2B2B2B', '#D9A098', '#A5BCA6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: $${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${baseCurrency} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    renderBudgetProgress() {
        const listElem = document.getElementById('budget-progress-list');
        if (!listElem) return;

        const { transactions, categories, accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};

        // 1. Obtener filtro de rango temporal seleccionado en la interfaz
        const { startDate, endDate } = this.getFilterDates();
        const filteredTx = transactions.filter(tx => {
            const comp = getLocalDateComponents(tx.date);
            if (!comp) return false;
            const txDate = new Date(comp.year, comp.month, comp.day);
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });

        // 2. Recopilar elementos presupuestados
        const budgetedItems = [];

        // Categorías de gasto con presupuesto mayor a 0
        categories.forEach(cat => {
            if (cat.type === 'expense' && parseFloat(cat.budget) > 0) {
                budgetedItems.push({
                    id: `cat_${cat.id}`,
                    name: cat.name,
                    icon: cat.icon || 'fa-tag',
                    color: cat.visual_color,
                    isAccount: false,
                    subtype: cat.subtype || 'fixed',
                    budget: parseFloat(cat.budget),
                    spent: 0
                });
            }
        });

        // Cuentas con presupuesto mayor a 0 (Futuros)
        accounts.forEach(acc => {
            if ((acc.type === 'savings' || acc.type === 'debt') && parseFloat(acc.budget) > 0) {
                budgetedItems.push({
                    id: `acc_${acc.id}`,
                    name: acc.name,
                    icon: acc.type === 'savings' ? 'fa-piggy-bank' : 'fa-hand-holding-dollar',
                    color: acc.color || '#A5BCA6',
                    isAccount: true,
                    subtype: 'future',
                    budget: parseFloat(acc.budget),
                    spent: 0 // Representará el flujo neto en base
                });
            }
        });

        // 3. Acumular transacciones reales para cada elemento
        filteredTx.forEach(tx => {
            // Gastos para categorías
            if (tx.type !== 'transfer') {
                const catId = `cat_${tx.category_id}`;
                const item = budgetedItems.find(i => i.id === catId);
                if (item) {
                    const cat = categories.find(c => String(c.id) === String(tx.category_id));
                    if (cat && cat.type === 'expense') {
                        const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                        const currency = acc ? acc.currency : baseCurrency;
                        const rate = rates[currency] || 1;
                        const amountInBase = parseFloat(tx.amount || 0) / rate;
                        item.spent += amountInBase;
                    }
                }
            }

            // Flujo neto para cuentas presupuestadas
            budgetedItems.forEach(item => {
                if (item.isAccount) {
                    const accId = String(item.id.replace('acc_', ''));
                    if (tx.type === 'transfer') {
                        if (String(tx.to_account_id) === accId) {
                            const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                            const rate = rates[toAcc ? toAcc.currency : baseCurrency] || 1;
                            item.spent += parseFloat(tx.amount_received || 0) / rate;
                        }
                        if (String(tx.from_account_id) === accId) {
                            const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                            const rate = rates[fromAcc ? fromAcc.currency : baseCurrency] || 1;
                            item.spent -= parseFloat(tx.amount_extracted || 0) / rate;
                        }
                    } else {
                        if (String(tx.account_id) === accId) {
                            const cat = categories.find(c => String(c.id) === String(tx.category_id));
                            if (cat) {
                                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                                const rate = rates[acc ? acc.currency : baseCurrency] || 1;
                                const amountInBase = parseFloat(tx.amount || 0) / rate;
                                if (cat.type === 'income') {
                                    item.spent += amountInBase;
                                } else if (cat.type === 'expense') {
                                    item.spent -= amountInBase;
                                }
                            }
                        }
                    }
                }
            });
        });

        if (budgetedItems.length === 0) {
            listElem.innerHTML = `
                <div class="empty-state" style="padding: 30px; text-align: center; color: var(--text-secondary); font-style: italic; background-color: var(--bg-card);">
                    <i class="fa-solid fa-calculator" style="font-size: 2rem; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p>No se han establecido topes o metas de presupuesto en la calculadora ZBB todavía.</p>
                    <p style="font-size: 0.85rem; margin-top: 5px;">Ve a la pestaña de Presupuesto ZBB para asignar límites a tus categorías y cuentas.</p>
                </div>
            `;
            return;
        }

        // 4. Ordenar: prioritariamente los límites excedidos en gastos o los menores progresos en ahorro primero
        budgetedItems.sort((a, b) => {
            const pctA = a.budget > 0 ? (a.spent / a.budget) * 100 : 0;
            const pctB = b.budget > 0 ? (b.spent / b.budget) * 100 : 0;
            
            // Si son de distinta naturaleza, ponemos los excedidos de gasto o menores de ahorro
            if (a.isAccount !== b.isAccount) {
                return a.isAccount ? 1 : -1; // Categorías de gasto primero para advertencias rápidas
            }
            
            if (!a.isAccount) {
                return pctB - pctA; // Mayor porcentaje de gasto excedido primero
            } else {
                return pctA - pctB; // Menor porcentaje de meta de ahorro cumplido primero
            }
        });

        // Helper para información de subtipo
        const getSubtypeInfo = (subtype) => {
            if (subtype === 'variable') {
                return { name: 'Deseo', color: '#D9A098', icon: 'fa-gift' };
            } else if (subtype === 'future') {
                return { name: 'Futuro', color: '#A5BCA6', icon: 'fa-piggy-bank' };
            } else {
                return { name: 'Necesidad', color: '#2B2B2B', icon: 'fa-house-chimney' };
            }
        };

        // 5. Renderizar
        listElem.innerHTML = budgetedItems.map((item) => {
            const budget = item.budget;
            let spent = item.spent;
            let pct = budget > 0 ? (spent / budget) * 100 : 0;
            let displayPct = pct;
            if (displayPct < 0) displayPct = 0; // Evitar barra de progreso negativa

            let barColor = '#4B5563'; // Gris neutro
            let badgeColor = 'rgba(0,0,0,0.06)';
            let badgeText = `${displayPct.toFixed(0)}%`;
            let statusText = 'En control';
            let statusIcon = 'fa-circle-check';
            let statusTextColor = 'var(--text-secondary)';

            if (item.isAccount) {
                // LÓGICA DE CUENTAS (META DE APORTE - FUTUROS)
                if (spent < 0) {
                    barColor = 'var(--action-expense)'; // Rojo para desahorro neto o incremento de deudas
                    badgeColor = 'rgba(178, 58, 30, 0.15)';
                    badgeText = `-$${Math.abs(spent).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    statusText = 'Flujo Negativo';
                    statusIcon = 'fa-circle-minus';
                    statusTextColor = 'var(--action-expense)';
                    displayPct = 0;
                } else if (pct >= 100) {
                    barColor = 'var(--action-income)'; // Verde para meta cumplida o superada
                    badgeColor = 'rgba(0, 95, 86, 0.15)';
                    badgeText = `¡Meta Alcanzada al ${pct.toFixed(0)}%!`;
                    statusText = 'Meta Cumplida';
                    statusIcon = 'fa-circle-check';
                    statusTextColor = 'var(--action-income)';
                } else if (pct >= 80) {
                    barColor = '#DFB574'; // Dorado para progreso aceptable
                    badgeColor = 'rgba(223, 181, 116, 0.15)';
                    badgeText = `${pct.toFixed(0)}%`;
                    statusText = 'Buen progreso';
                    statusIcon = 'fa-circle-exclamation';
                    statusTextColor = '#DFB574';
                } else {
                    barColor = '#4B5563'; // Gris/Rojo suave para progreso bajo
                    badgeColor = 'rgba(75, 85, 99, 0.1)';
                    badgeText = `${pct.toFixed(0)}%`;
                    statusText = 'Pendiente / Bajo aporte';
                    statusIcon = 'fa-hourglass';
                    statusTextColor = 'var(--text-secondary)';
                }
            } else {
                // LÓGICA DE CATEGORÍAS (LÍMITE DE GASTO - NECESIDADES/DESEOS)
                if (pct >= 100) {
                    barColor = 'var(--action-expense)';
                    badgeColor = 'rgba(178, 58, 30, 0.15)';
                    badgeText = `¡Excedido por ${(pct - 100).toFixed(0)}%!`;
                    statusText = 'Límite Superado';
                    statusIcon = 'fa-triangle-exclamation';
                    statusTextColor = 'var(--action-expense)';
                } else if (pct >= 80) {
                    barColor = '#DFB574';
                    badgeColor = 'rgba(223, 181, 116, 0.15)';
                    badgeText = `${pct.toFixed(0)}%`;
                    statusText = 'Cerca del límite';
                    statusIcon = 'fa-circle-exclamation';
                    statusTextColor = '#DFB574';
                }
            }

            const subtypeInfo = getSubtypeInfo(item.subtype);

            // Textos descriptivos condicionales
            const spentLabel = item.isAccount ? 'Aportado' : 'Gastado';
            const limitLabel = item.isAccount ? 'Meta' : 'Límite';

            // Calcular remanente/disponible o excedido
            let remainingText = '';
            let remainingClass = 'ok';
            if (item.isAccount) {
                const diff = budget - spent;
                if (diff > 0) {
                    remainingText = `Faltan: $${diff.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    remainingClass = 'warn';
                } else {
                    remainingText = `¡Meta alcanzada!`;
                    remainingClass = 'ok';
                }
            } else {
                const diff = budget - spent;
                if (diff >= 0) {
                    remainingText = `Disponible: $${diff.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    remainingClass = 'ok';
                } else {
                    remainingText = `Excedido por: $${Math.abs(diff).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    remainingClass = 'error';
                }
            }

            return `
                <div class="budget-card">
                    <div class="budget-card-header">
                        <div class="budget-card-info">
                            <div class="budget-card-icon" style="background-color: ${item.color};">
                                <i class="fa-solid ${item.icon}"></i>
                            </div>
                            <div class="budget-card-title-group">
                                <strong class="budget-card-name">${item.name}</strong>
                                <div class="budget-badge-type" style="background-color: ${subtypeInfo.color}22; color: ${subtypeInfo.color === '#2B2B2B' ? 'var(--text-primary)' : subtypeInfo.color}; border: 1px solid ${subtypeInfo.color === '#2B2B2B' ? 'var(--text-primary)' : subtypeInfo.color}; align-self: flex-start; margin-top: 2px;">
                                    <i class="fa-solid ${subtypeInfo.icon}" style="font-size: 0.65rem;"></i>
                                    ${subtypeInfo.name}
                                </div>
                            </div>
                        </div>
                        <span class="budget-badge-status" style="color: ${statusTextColor}; background-color: ${badgeColor};">
                            <i class="fa-solid ${statusIcon}"></i>
                            ${statusText}
                        </span>
                    </div>

                    <div class="budget-card-amount-row">
                        <span class="budget-card-amount-main">
                            ${spentLabel}: <strong>$${spent.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        </span>
                        <span class="budget-card-amount-limit">
                            ${limitLabel}: <span>$${budget.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </span>
                    </div>

                    <div class="budget-card-progress-container">
                        <div class="budget-card-progress-bar" style="width: ${Math.min(100, displayPct)}%; background: ${barColor};"></div>
                    </div>

                    <div class="budget-card-remaining-row">
                        <span class="budget-card-remaining-label">Progreso</span>
                        <span class="budget-card-percentage">${badgeText}</span>
                    </div>

                    <div class="budget-card-remaining-row" style="margin-top: -6px; border-top: none; padding-top: 0;">
                        <span class="budget-card-remaining-label">Estado</span>
                        <span class="budget-card-remaining-value ${remainingClass}">${remainingText}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderDebtSimulator() {
        const container = document.getElementById('analytics-debt-container');
        if (!container) return;

        const { accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};

        // Recopilar deudas registradas
        const debtAccounts = accounts.filter(a => a.type === 'debt' && a.balance > 0);
        
        let debtsData = debtAccounts.map(a => {
            const rate = rates[a.currency] || 1;
            const balInBase = a.balance / rate;
            return {
                id: a.id,
                name: a.name,
                currency: a.currency,
                balance: balInBase,
                apr: 18.0, // Tasa estándar por defecto si no está seteada
                minPayment: Math.max(25, Math.round(balInBase * 0.03)) // 3% del saldo o $25
            };
        });

        // Guardar estado en el objeto de Analytics para persistir ediciones en la vista actual
        if (!this._debtSimState) {
            this._debtSimState = {
                extraMonthly: 100,
                customDebts: debtsData.length > 0 ? debtsData : [
                    { id: 'd1', name: 'Tarjeta de Crédito', balance: 2500, apr: 22.5, minPayment: 75 },
                    { id: 'd2', name: 'Préstamo Personal', balance: 5000, apr: 14.0, minPayment: 150 },
                    { id: 'd3', name: 'Crédito Vehicular', balance: 8000, apr: 9.5, minPayment: 220 }
                ]
            };
        }

        const extraMonthly = this._debtSimState.extraMonthly;
        const debts = this._debtSimState.customDebts;

        // Motor de Simulación
        const runSimulation = (strategy, extra) => {
            if (debts.length === 0) return { months: 0, monthsNum: 0, interest: 0, totalPaid: 0 };

            let list = debts.map(d => ({
                name: d.name,
                balance: parseFloat(d.balance) || 0,
                apr: parseFloat(d.apr) || 0,
                minPayment: parseFloat(d.minPayment) || 0
            })).filter(d => d.balance > 0);

            if (list.length === 0) return { months: 0, monthsNum: 0, interest: 0, totalPaid: 0 };

            if (strategy === 'snowball') {
                list.sort((a, b) => a.balance - b.balance);
            } else if (strategy === 'avalanche') {
                list.sort((a, b) => b.apr - a.apr);
            }

            const initialTotalMin = list.reduce((sum, d) => sum + d.minPayment, 0);
            const totalBudget = initialTotalMin + (strategy === 'min' ? 0 : extra);

            let months = 0;
            let totalInterest = 0;
            const maxMonths = 480; // 40 años límite

            while (list.some(d => d.balance > 0.01) && months < maxMonths) {
                months++;
                let availablePool = totalBudget;

                // 1. Cobro de interés mensual
                list.forEach(d => {
                    if (d.balance > 0.01) {
                        const monthlyRate = (d.apr / 100) / 12;
                        const interest = d.balance * monthlyRate;
                        d.balance += interest;
                        totalInterest += interest;
                    }
                });

                // 2. Pago de cuotas mínimas
                list.forEach(d => {
                    if (d.balance > 0.01) {
                        const pay = Math.min(d.balance, d.minPayment);
                        d.balance -= pay;
                        availablePool -= pay;
                    }
                });

                // 3. Vuelco de remanente (Snowball o Avalanche) a la deuda prioritaria
                if (strategy !== 'min' && availablePool > 0) {
                    for (let d of list) {
                        if (d.balance > 0.01) {
                            const extraPay = Math.min(d.balance, availablePool);
                            d.balance -= extraPay;
                            availablePool -= extraPay;
                            if (availablePool <= 0.01) break;
                        }
                    }
                }
            }

            const totalPrincipal = debts.reduce((sum, d) => sum + (parseFloat(d.balance) || 0), 0);
            return {
                months: months >= maxMonths ? '> 40 años' : months,
                monthsNum: months,
                interest: totalInterest,
                totalPaid: totalPrincipal + totalInterest
            };
        };

        const resSnowball = runSimulation('snowball', extraMonthly);
        const resAvalanche = runSimulation('avalanche', extraMonthly);
        const resMin = runSimulation('min', 0);

        const interestSaved = Math.max(0, resMin.interest - resAvalanche.interest);
        const monthsSaved = typeof resMin.monthsNum === 'number' && typeof resAvalanche.monthsNum === 'number'
            ? Math.max(0, resMin.monthsNum - resAvalanche.monthsNum) : 0;

        container.innerHTML = `
            <div class="settings-card" style="margin-bottom: 25px; border: 2.5px solid var(--text-primary); border-radius: 12px 4px 10px 6px; padding: 20px; background-color: var(--bg-card); box-shadow: var(--shadow-neo);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; border-bottom: 2px dashed var(--text-primary); padding-bottom: 12px;">
                    <div>
                        <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.3rem; font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-hand-holding-dollar" style="color: var(--action-expense);"></i>
                            Simulador de Amortización de Deudas
                        </h3>
                        <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--text-secondary);">Compara matemáticamente la velocidad y el ahorro entre el método Bola de Nieve vs Avalancha.</p>
                    </div>
                </div>

                <!-- Input de Aporte Extra Mensual -->
                <div style="background: rgba(0,0,0,0.03); border: 2px solid var(--text-primary); border-radius: 8px; padding: 15px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <strong style="font-size: 1rem; color: var(--text-primary); display: block;">Pago Mensual Acelerador (Extra)</strong>
                        <span style="font-size: 0.82rem; color: var(--text-secondary);">Monto adicional que puedes aportar al mes por encima de los pagos mínimos.</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-family: var(--font-heading); font-weight: bold; font-size: 1.2rem;">$</span>
                        <input type="number" id="debt-extra-input" class="filter-select" style="width: 130px; font-size: 1.15rem; font-weight: bold; text-align: right; padding: 8px; font-family: 'Inconsolata';" value="${extraMonthly}">
                    </div>
                </div>

                <!-- Tarjetas de Comparativa de Estrategias -->
                <div class="compare-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 25px;">
                    <!-- AVALANCHA -->
                    <div class="compare-card" style="border: 2.5px solid var(--text-primary); background: #E8F0E8; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="font-weight: 800; font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-primary);">Método Avalancha</span>
                            <span class="badge" style="background: #2E7D32; color: #fff; font-size: 0.7rem; font-weight: bold;">Máximo Ahorro</span>
                        </div>
                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">Prioriza liquidar primero las deudas con <strong>mayor tasa de interés (APR)</strong>.</p>
                        <div style="display: flex; flex-direction: column; gap: 6px; font-family: 'Inconsolata';">
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>Tiempo para liquidar:</span>
                                <strong>${resAvalanche.months} meses (${(resAvalanche.monthsNum / 12).toFixed(1)} años)</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>Intereses totales:</span>
                                <strong style="color: var(--action-expense);">$${Math.round(resAvalanche.interest).toLocaleString('es-ES')}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 6px;">
                                <span>Desembolso total:</span>
                                <strong>$${Math.round(resAvalanche.totalPaid).toLocaleString('es-ES')}</strong>
                            </div>
                        </div>
                    </div>

                    <!-- BOLA DE NIEVE -->
                    <div class="compare-card" style="border: 2.5px solid var(--text-primary); background: #EBF3F5; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="font-weight: 800; font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-primary);">Método Bola de Nieve</span>
                            <span class="badge" style="background: #0288D1; color: #fff; font-size: 0.7rem; font-weight: bold;">Impulso Psicológico</span>
                        </div>
                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">Prioriza liquidar primero las deudas con <strong>menor saldo pendiente</strong>.</p>
                        <div style="display: flex; flex-direction: column; gap: 6px; font-family: 'Inconsolata';">
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>Tiempo para liquidar:</span>
                                <strong>${resSnowball.months} meses (${(resSnowball.monthsNum / 12).toFixed(1)} años)</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>Intereses totales:</span>
                                <strong style="color: var(--action-expense);">$${Math.round(resSnowball.interest).toLocaleString('es-ES')}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 6px;">
                                <span>Desembolso total:</span>
                                <strong>$${Math.round(resSnowball.totalPaid).toLocaleString('es-ES')}</strong>
                            </div>
                        </div>
                    </div>

                    <!-- SOLO PAGOS MÍNIMOS -->
                    <div class="compare-card" style="border: 2.5px solid var(--text-primary); background: #FDF4E7; opacity: 0.9;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span style="font-weight: 800; font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-primary);">Solo Pagos Mínimos</span>
                            <span class="badge" style="background: #E65100; color: #fff; font-size: 0.7rem; font-weight: bold;">Línea Base</span>
                        </div>
                        <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">Sin aportar ningún monto extra mensual.</p>
                        <div style="display: flex; flex-direction: column; gap: 6px; font-family: 'Inconsolata';">
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>Tiempo para liquidar:</span>
                                <strong>${resMin.months} meses</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                                <span>Intereses totales:</span>
                                <strong style="color: var(--action-expense);">$${Math.round(resMin.interest).toLocaleString('es-ES')}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 6px;">
                                <span>Desembolso total:</span>
                                <strong>$${Math.round(resMin.totalPaid).toLocaleString('es-ES')}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Resumen de Ahorro y Conclusión -->
                <div style="background: var(--bg-primary); border: 2px solid var(--text-primary); border-radius: 8px; padding: 15px; margin-bottom: 25px; box-shadow: 2px 2px 0px var(--text-primary);">
                    <h4 style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 800; margin-bottom: 8px; color: var(--text-primary);">
                        <i class="fa-solid fa-trophy" style="color: var(--accent-gold);"></i> Conclusión Financiera
                    </h4>
                    <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); margin: 0;">
                        Aplicar el método Avalancha con tu aporte extra te ahorra aproximadamente <strong>$${Math.round(interestSaved).toLocaleString('es-ES')} ${baseCurrency}</strong> en intereses y te libera de deudas <strong>${monthsSaved} meses antes</strong> en comparación con pagar solo los montos mínimos.
                    </p>
                </div>

                <!-- Tabla Interactiva de Deudas Incluidas -->
                <div style="margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h4 style="margin: 0; font-family: var(--font-heading); font-size: 1.15rem; font-weight: bold;">Deudas en el Simulador</h4>
                        <button type="button" id="debt-add-row-btn" class="btn btn-save" style="padding: 6px 12px; font-size: 0.82rem; margin: 0; box-shadow: 1.5px 1.5px 0px var(--text-primary);">
                            <i class="fas fa-plus"></i> Añadir Deuda
                        </button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 10px;" id="debt-items-list">
                        ${debts.map((d, idx) => `
                            <div class="transaction-item" style="padding: 12px; background: var(--bg-primary); border: 2px solid var(--text-primary); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                <div style="flex: 1 1 160px; min-width: 130px;">
                                    <input type="text" class="debt-name-input filter-select" data-idx="${idx}" value="${escapeHTML(d.name)}" style="width: 100%; font-weight: bold; padding: 6px;" placeholder="Nombre de la deuda">
                                </div>
                                <div style="display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; flex: 2 1 200px; justify-content: space-between;">
                                    <div style="flex: 1 1 65px; min-width: 60px;">
                                        <label style="font-size: 0.72rem; font-weight: bold; color: var(--text-secondary); display: block; margin-bottom: 2px;">Saldo ($)</label>
                                        <input type="number" class="debt-bal-input filter-select" data-idx="${idx}" value="${d.balance}" style="width: 100%; text-align: right; padding: 6px; font-family: 'Inconsolata'; font-weight: bold;">
                                    </div>
                                    <div style="flex: 1 1 55px; min-width: 50px;">
                                        <label style="font-size: 0.72rem; font-weight: bold; color: var(--text-secondary); display: block; margin-bottom: 2px;">APR (%)</label>
                                        <input type="number" step="0.1" class="debt-apr-input filter-select" data-idx="${idx}" value="${d.apr}" style="width: 100%; text-align: right; padding: 6px; font-family: 'Inconsolata'; font-weight: bold;">
                                    </div>
                                    <div style="flex: 1 1 65px; min-width: 60px;">
                                        <label style="font-size: 0.72rem; font-weight: bold; color: var(--text-secondary); display: block; margin-bottom: 2px;">Pago Mín ($)</label>
                                        <input type="number" class="debt-min-input filter-select" data-idx="${idx}" value="${d.minPayment}" style="width: 100%; text-align: right; padding: 6px; font-family: 'Inconsolata'; font-weight: bold;">
                                    </div>
                                    <button type="button" class="btn-icon debt-del-btn" data-idx="${idx}" title="Eliminar deuda" style="padding: 6px 8px; margin-bottom: 2px;">
                                        <i class="fas fa-trash-alt" style="color: var(--action-expense);"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        // Listeners interactivos del Simulador de Deudas
        const extraInput = document.getElementById('debt-extra-input');
        if (extraInput) {
            extraInput.oninput = (e) => {
                const val = parseFloat(e.target.value) || 0;
                this._debtSimState.extraMonthly = val;
                this.renderDebtSimulator();
            };
        }

        const addRowBtn = document.getElementById('debt-add-row-btn');
        if (addRowBtn) {
            addRowBtn.onclick = () => {
                this._debtSimState.customDebts.push({
                    id: 'd_' + Date.now(),
                    name: 'Nueva Deuda',
                    balance: 1000,
                    apr: 18.0,
                    minPayment: 50
                });
                this.renderDebtSimulator();
            };
        }

        container.querySelectorAll('.debt-name-input').forEach(input => {
            input.onchange = (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                if (this._debtSimState.customDebts[idx]) {
                    this._debtSimState.customDebts[idx].name = e.target.value;
                }
            };
        });

        container.querySelectorAll('.debt-bal-input').forEach(input => {
            input.oninput = (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                if (this._debtSimState.customDebts[idx]) {
                    this._debtSimState.customDebts[idx].balance = parseFloat(e.target.value) || 0;
                    this.renderDebtSimulator();
                }
            };
        });

        container.querySelectorAll('.debt-apr-input').forEach(input => {
            input.oninput = (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                if (this._debtSimState.customDebts[idx]) {
                    this._debtSimState.customDebts[idx].apr = parseFloat(e.target.value) || 0;
                    this.renderDebtSimulator();
                }
            };
        });

        container.querySelectorAll('.debt-min-input').forEach(input => {
            input.oninput = (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                if (this._debtSimState.customDebts[idx]) {
                    this._debtSimState.customDebts[idx].minPayment = parseFloat(e.target.value) || 0;
                    this.renderDebtSimulator();
                }
            };
        });

        container.querySelectorAll('.debt-del-btn').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx, 10);
                this._debtSimState.customDebts.splice(idx, 1);
                this.renderDebtSimulator();
            };
        });
    },

    renderSplitBill() {
        const container = document.getElementById('analytics-split-container');
        if (!container) return;

        const baseCurrency = State.db.settings.baseCurrency || 'USD';

        if (!this._splitState) {
            this._splitState = {
                subtotal: 120.00,
                tipPercent: 15,
                taxPercent: 0,
                numPeople: 3,
                mode: 'equal'
            };
        }

        const state = this._splitState;
        const subtotal = state.subtotal;
        const tipAmount = subtotal * (state.tipPercent / 100);
        const taxAmount = subtotal * (state.taxPercent / 100);
        const grandTotal = subtotal + tipAmount + taxAmount;
        const perPersonEqual = state.numPeople > 0 ? (grandTotal / state.numPeople) : 0;

        container.innerHTML = `
            <div class="settings-card" style="margin-bottom: 25px; border: 2.5px solid var(--text-primary); border-radius: 12px 4px 10px 6px; padding: 20px; background-color: var(--bg-card); box-shadow: var(--shadow-neo);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; border-bottom: 2px dashed var(--text-primary); padding-bottom: 12px;">
                    <div>
                        <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.3rem; font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-receipt" style="color: var(--action-income);"></i>
                            Divisor de Gastos Compartidos (Split Bills)
                        </h3>
                        <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--text-secondary);">Calcula propinas, impuestos y reparte cuentas grupales de forma justa e instantánea.</p>
                    </div>
                </div>

                <!-- Entradas Generales -->
                <div class="compare-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <div>
                        <label style="font-weight: bold; font-size: 0.9rem; margin-bottom: 5px; display: block;">Monto de la Cuenta (Subtotal)</label>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-family: var(--font-heading); font-weight: bold; font-size: 1.2rem;">$</span>
                            <input type="number" id="split-subtotal" class="filter-select" style="width: 100%; font-size: 1.2rem; font-weight: bold; font-family: 'Inconsolata'; padding: 8px;" value="${subtotal}">
                        </div>
                    </div>

                    <div>
                        <label style="font-weight: bold; font-size: 0.9rem; margin-bottom: 5px; display: block;">Número de Personas</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button type="button" id="split-person-dec" class="btn btn-secondary" style="padding: 8px 14px; font-weight: bold; font-size: 1.1rem; border: 2px solid var(--text-primary); cursor: pointer;">-</button>
                            <input type="number" id="split-num-people" class="filter-select" style="flex: 1; min-width: 50px; text-align: center; font-size: 1.15rem; font-weight: bold; font-family: 'Inconsolata'; padding: 8px;" value="${state.numPeople}" min="1">
                            <button type="button" id="split-person-inc" class="btn btn-secondary" style="padding: 8px 14px; font-weight: bold; font-size: 1.1rem; border: 2px solid var(--text-primary); cursor: pointer;">+</button>
                        </div>
                    </div>
                </div>

                <!-- Selector de Propina -->
                <div style="margin-bottom: 20px;">
                    <label style="font-weight: bold; font-size: 0.9rem; margin-bottom: 8px; display: block;">Propina: ${state.tipPercent}% ($${tipAmount.toFixed(2)})</label>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${[0, 10, 15, 18, 20].map(tip => `
                            <button type="button" class="btn split-tip-btn ${state.tipPercent === tip ? 'btn-save' : 'btn-secondary'}" data-tip="${tip}" style="flex: 1 1 50px; min-width: 48px; padding: 8px 10px; font-size: 0.9rem; font-weight: bold; border: 2px solid var(--text-primary); border-radius: 6px; box-shadow: 1.5px 1.5px 0px var(--text-primary); cursor: pointer; text-align: center;">
                                ${tip}%
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Resumen de Totales -->
                <div style="background: rgba(0,0,0,0.03); border: 2px solid var(--text-primary); border-radius: 8px; padding: 18px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-family: 'Inconsolata'; font-size: 0.95rem;">
                        <span>Subtotal:</span>
                        <strong>$${subtotal.toFixed(2)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-family: 'Inconsolata'; font-size: 0.95rem;">
                        <span>Propina (${state.tipPercent}%):</span>
                        <strong>$${tipAmount.toFixed(2)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 2px solid var(--text-primary); padding-top: 10px; margin-top: 8px; font-family: 'Inconsolata'; font-size: 1.25rem;">
                        <span style="font-weight: bold;">TOTAL GENERAL:</span>
                        <strong style="color: var(--action-income);">$${grandTotal.toFixed(2)} ${baseCurrency}</strong>
                    </div>
                </div>

                <!-- Resultado por Persona -->
                <div style="background: #FFF9E6; border: 2.5px solid var(--text-primary); border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px; box-shadow: 3px 3px 0px var(--text-primary);">
                    <span style="font-size: 0.95rem; font-weight: bold; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Cada persona paga</span>
                    <h2 style="margin: 8px 0; font-family: var(--font-heading); font-size: 2.3rem; font-weight: 900; color: var(--text-primary); word-break: break-word;">$${perPersonEqual.toFixed(2)} <span style="font-size: 1.1rem; font-family: var(--font-body);">${baseCurrency}</span></h2>
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">División equitativa entre ${state.numPeople} persona(s)</span>
                </div>

                <!-- Acciones Rápidas -->
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button type="button" id="split-copy-btn" class="btn btn-secondary" style="flex: 1 1 180px; min-width: 160px; padding: 12px; font-size: 0.95rem; font-weight: bold; border: 2px solid var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 2px 2px 0px var(--text-primary);">
                        <i class="fas fa-copy"></i> Copiar para WhatsApp
                    </button>
                    <button type="button" id="split-record-expense-btn" class="btn btn-save" style="flex: 1 1 180px; min-width: 160px; padding: 12px; font-size: 0.95rem; font-weight: bold; border: 2px solid var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 2px 2px 0px var(--text-primary);">
                        <i class="fas fa-arrow-up"></i> Registrar Mi Parte
                    </button>
                </div>
            </div>
        `;

        // Listeners interactivos del Divisor de Gastos
        const subtotalInput = document.getElementById('split-subtotal');
        if (subtotalInput) {
            subtotalInput.oninput = (e) => {
                this._splitState.subtotal = parseFloat(e.target.value) || 0;
                this.renderSplitBill();
            };
        }

        const numInput = document.getElementById('split-num-people');
        if (numInput) {
            numInput.oninput = (e) => {
                this._splitState.numPeople = Math.max(1, parseInt(e.target.value, 10) || 1);
                this.renderSplitBill();
            };
        }

        const decBtn = document.getElementById('split-person-dec');
        if (decBtn) {
            decBtn.onclick = () => {
                this._splitState.numPeople = Math.max(1, this._splitState.numPeople - 1);
                this.renderSplitBill();
            };
        }

        const incBtn = document.getElementById('split-person-inc');
        if (incBtn) {
            incBtn.onclick = () => {
                this._splitState.numPeople = this._splitState.numPeople + 1;
                this.renderSplitBill();
            };
        }

        container.querySelectorAll('.split-tip-btn').forEach(btn => {
            btn.onclick = () => {
                this._splitState.tipPercent = parseInt(btn.dataset.tip, 10);
                this.renderSplitBill();
            };
        });

        const copyBtn = document.getElementById('split-copy-btn');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                const text = `🧾 *Desglose de Cuenta Compartida*\n` +
                    `--------------------------------\n` +
                    `💵 Subtotal: $${subtotal.toFixed(2)} ${baseCurrency}\n` +
                    `✨ Propina (${state.tipPercent}%): $${tipAmount.toFixed(2)} ${baseCurrency}\n` +
                    `💰 Total General: $${grandTotal.toFixed(2)} ${baseCurrency}\n` +
                    `👥 Participantes: ${state.numPeople}\n` +
                    `--------------------------------\n` +
                    `👉 *Pago por persona: $${perPersonEqual.toFixed(2)} ${baseCurrency}*\n` +
                    `--------------------------------\n` +
                    `_Calculado con Finanzas Personales v2_`;

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    try {
                        await navigator.clipboard.writeText(text);
                        await ModalService.alert("El desglose de la cuenta se ha copiado al portapapeles. ¡Listo para pegar en WhatsApp o mensajes!", "Copiado con Éxito", "success");
                    } catch (e) {
                        await ModalService.alert("No se pudo copiar automáticamente. Puedes seleccionar el texto manualmente.", "Aviso");
                    }
                }
            };
        }

        const recordExpenseBtn = document.getElementById('split-record-expense-btn');
        if (recordExpenseBtn) {
            recordExpenseBtn.onclick = () => {
                if (window.FormService) {
                    window.FormService.openTransactionModal('expense', {
                        amount: perPersonEqual.toFixed(2),
                        notes: `Cuenta compartida (${state.numPeople} personas, propina ${state.tipPercent}%)`
                    });
                }
            };
        }
    }
};
