import { State } from './state.js';
import { getLocalDateComponents, standardizeDate } from './ui.js';

export const Analytics = {
    charts: {
        expenses: null,
        netWorth: null,
        zbbRule: null
    },

    init() {
        console.log("Analytics: Inicializando gráficos...");
        this.renderExpensesChart();
        this.renderNetWorthChart();
        this.renderZbbRuleChart();
        
        // Escuchar cambios en el selector de filtro de tiempo
        const timeFilter = document.getElementById('analytics-time-filter');
        if (timeFilter) {
            timeFilter.addEventListener('change', () => {
                console.log(`Analytics: Filtro de rango temporal cambiado a: ${timeFilter.value}`);
                this.updateCharts();
            });
        }
        
        // Suscribirse a cambios para actualizar gráficos automáticamente
        State.subscribe(() => {
            this.updateCharts();
        });
    },

    updateCharts() {
        if (this.charts.expenses) this.charts.expenses.destroy();
        if (this.charts.netWorth) this.charts.netWorth.destroy();
        if (this.charts.zbbRule) this.charts.zbbRule.destroy();
        this.renderExpensesChart();
        this.renderNetWorthChart();
        this.renderZbbRuleChart();
    },

    renderExpensesChart() {
        const ctx = document.getElementById('expenses-chart');
        if (!ctx) return;

        const { transactions, categories, accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};

        // Obtener filtro de tiempo
        const timeFilter = document.getElementById('analytics-time-filter')?.value || 'all';
        let filteredTx = transactions;
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
            filteredTx = transactions.filter(tx => {
                const comp = getLocalDateComponents(tx.date);
                if (!comp) return false;
                const txDate = new Date(comp.year, comp.month, comp.day);
                return txDate >= cutoffDate;
            });
        }
        
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
        const now = new Date();
        const todayStr = toLocalDateStr(now);
        let startDate = new Date();
        const timeFilter = document.getElementById('analytics-time-filter')?.value || 'all';

        if (timeFilter === 'week') {
            startDate.setDate(now.getDate() - 6); // 7 días en total incluyendo hoy
        } else if (timeFilter === 'month') {
            startDate.setDate(now.getDate() - 29); // 30 días
        } else if (timeFilter === '3months') {
            startDate.setDate(now.getDate() - 89); // 90 días
        } else if (timeFilter === 'year') {
            startDate.setFullYear(now.getFullYear() - 1); // 1 año
        } else {
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
                startDate.setDate(now.getDate() - 29); // Fallback a 30 días
            }
        }

        // Generar lista continua de fechas locales YYYY-MM-DD en el rango
        const dateRange = [];
        let tempD = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const nowLocalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        while (tempD <= nowLocalDate) {
            dateRange.push(toLocalDateStr(tempD));
            tempD.setDate(tempD.getDate() + 1);
        }

        // 2. Calcular el patrimonio neto actual real (a fecha de hoy)
        let currentNW = 0;
        accounts.forEach(acc => {
            const rate = rates[acc.currency] || 1;
            currentNW += acc.balance / rate;
        });

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
                const fromAcc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                const toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                
                const rateFrom = fromAcc ? (rates[fromAcc.currency] || 1) : 1;
                const rateTo = toAcc ? (rates[toAcc.currency] || 1) : 1;
                
                const extractedInBase = parseFloat(tx.amount_extracted || 0) / rateFrom;
                const receivedInBase = parseFloat(tx.amount_received || 0) / rateTo;
                
                currentNW = currentNW + extractedInBase - receivedInBase;
            } else {
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                const currency = acc ? acc.currency : baseCurrency;
                const rate = rates[currency] || 1;
                const amountInBase = parseFloat(tx.amount || 0) / rate;
                
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

        const { transactions, categories, goals, accounts } = State.db;
        const baseCurrency = State.db.settings.baseCurrency || 'USD';
        const rates = State.db.settings.exchangeRates || {};
        
        // Obtener filtro de rango temporal seleccionado en la interfaz
        const timeFilter = document.getElementById('analytics-time-filter')?.value || 'all';
        let filteredTx = transactions;
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
            filteredTx = transactions.filter(tx => {
                const comp = getLocalDateComponents(tx.date);
                if (!comp) return false;
                const txDate = new Date(comp.year, comp.month, comp.day);
                return txDate >= cutoffDate;
            });
        }
        
        let totalIncomeReal = 0;
        let totalNeeds = 0;
        let totalWants = 0;
        
        filteredTx.forEach(tx => {
            const cat = categories.find(c => String(c.id) === String(tx.category_id));
            if (cat) {
                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                const currency = acc ? acc.currency : baseCurrency;
                const rate = rates[currency] || 1;
                const amountInBase = parseFloat(tx.amount || 0) / rate;
                
                if (cat.type === 'income') {
                    totalIncomeReal += amountInBase;
                } else if (cat.type === 'expense') {
                    if (cat.subtype === 'fixed') {
                        totalNeeds += amountInBase;
                    } else {
                        totalWants += amountInBase;
                    }
                }
            }
        });

        // Ahorros reales = Progreso actual de las metas en moneda base
        let totalSavings = 0;
        goals.forEach(g => {
            const current = g.account_id ? (accounts.find(a => String(a.id) === String(g.account_id))?.balance || 0) : (g.current || 0);
            
            let currency = baseCurrency;
            if (g.account_id) {
                const acc = accounts.find(a => String(a.id) === String(g.account_id));
                if (acc) currency = acc.currency;
            }
            const rate = rates[currency] || 1;
            totalSavings += current / rate;
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
                    <strong>Ahorro (Ideal 20%):</strong> 
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
            ctx.parentElement.innerHTML = '<div class="empty-state" style="padding: 40px 0;">Registra ingresos, gastos o metas para activar la regla 50/30/20</div>';
            return;
        }

        this.charts.zbbRule = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Necesidades', 'Deseos', 'Ahorro'],
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
    }
};
