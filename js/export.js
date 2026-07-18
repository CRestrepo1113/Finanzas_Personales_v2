import { State } from './state.js';

export const ExportService = {
    // Auxiliar para formatear fechas a YYYY-MM-DD
    toLocalDateStr(dObj) {
        const yyyy = dObj.getFullYear();
        const mm = String(dObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    // Auxiliar para formatear fecha legible
    toReadableDate(dateStr) {
        if (!dateStr) return 'Completo';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    },

    // Formatear número con coma decimal y dos cifras decimales
    formatNumber(val) {
        if (val === null || val === undefined || isNaN(parseFloat(val))) return '0,00';
        return parseFloat(val).toLocaleString('es-ES', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    },

    // Convertir DataURL Base64 a ArrayBuffer puro para docx.js
    base64ToArrayBuffer(base64Str) {
        if (!base64Str || typeof base64Str !== 'string' || !base64Str.includes(';base64,')) {
            return null;
        }
        try {
            const parts = base64Str.split(';base64,');
            if (parts.length < 2) return null;
            const raw = window.atob(parts[1]);
            const rawLength = raw.length;
            const arrayBuffer = new ArrayBuffer(rawLength);
            const uInt8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < rawLength; ++i) {
                uInt8Array[i] = raw.charCodeAt(i);
            }
            return arrayBuffer;
        } catch (e) {
            return null;
        }
    },

    // Renderizar un gráfico Chart.js en un canvas offscreen y retornar ArrayBuffer PNG
    renderOffscreenChart(chartConfig, width = 800, height = 500) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(canvas);

        try {
            const chart = new Chart(canvas, chartConfig);
            chart.update('none');
            const dataUrl = canvas.toDataURL('image/png');
            chart.destroy();
            document.body.removeChild(canvas);
            return this.base64ToArrayBuffer(dataUrl);
        } catch (e) {
            console.warn('ExportService: Error al renderizar gráfico offscreen:', e);
            document.body.removeChild(canvas);
            return null;
        }
    },

    // Construir los 3 gráficos offscreen con estilo profesional para Word
    buildExportCharts(startDate, endDate) {
        const { transactions, categories, accounts, settings } = State.db;
        const baseCurrency = settings.baseCurrency || 'USD';
        const rates = settings.exchangeRates || {};
        const fmtNum = (v) => parseFloat(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Filtrar transacciones del periodo
        const filteredTx = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            if (isNaN(txDate.getTime())) return false;
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });

        const chartBuffers = {};

        // ──────────── GRÁFICO 1: DISTRIBUCIÓN DE GASTOS (DONA) ────────────
        const categoryTotals = {};
        const categoryColors = {};
        let totalExpenses = 0;

        filteredTx.forEach(tx => {
            if (tx.type === 'transfer' || tx.category_id === 'transfer') return;
            const cat = categories.find(c => String(c.id) === String(tx.category_id));
            if (!cat || cat.type !== 'expense') return;
            const acc = accounts.find(a => String(a.id) === String(tx.account_id));
            const currency = acc ? acc.currency : baseCurrency;
            const rate = rates[currency] || 1;
            const amountInBase = parseFloat(tx.amount || 0) / rate;
            categoryTotals[cat.name] = (categoryTotals[cat.name] || 0) + amountInBase;
            categoryColors[cat.name] = cat.visual_color || '#999';
            totalExpenses += amountInBase;
        });

        const expLabels = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
        const expData = expLabels.map(n => parseFloat(categoryTotals[n].toFixed(2)));
        const expColors = expLabels.map(n => categoryColors[n]);

        if (expLabels.length > 0) {
            // Plugin inline para dibujar etiquetas de porcentaje en cada segmento de dona
            const datalabelPlugin = {
                id: 'exportDatalabels',
                afterDraw(chart) {
                    const ctx = chart.ctx;
                    const dataset = chart.data.datasets[0];
                    const meta = chart.getDatasetMeta(0);
                    const total = dataset.data.reduce((a, b) => a + b, 0);
                    
                    meta.data.forEach((arc, i) => {
                        const pct = total > 0 ? ((dataset.data[i] / total) * 100) : 0;
                        if (pct < 4) return; // No dibujar etiquetas en segmentos muy pequeños
                        
                        const centerAngle = (arc.startAngle + arc.endAngle) / 2;
                        const radius = (arc.innerRadius + arc.outerRadius) / 2;
                        const x = arc.x + Math.cos(centerAngle) * radius;
                        const y = arc.y + Math.sin(centerAngle) * radius;
                        
                        ctx.save();
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = 'bold 13px Georgia, serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        // Sombra para legibilidad
                        ctx.shadowColor = 'rgba(0,0,0,0.6)';
                        ctx.shadowBlur = 3;
                        ctx.fillText(`${pct.toFixed(1)}%`, x, y);
                        ctx.restore();
                    });
                }
            };

            chartBuffers.expenses = this.renderOffscreenChart({
                type: 'doughnut',
                data: {
                    labels: expLabels,
                    datasets: [{
                        data: expData,
                        backgroundColor: expColors,
                        borderColor: '#FFFFFF',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: false,
                    animation: false,
                    layout: { padding: { bottom: 10 } },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: '#333',
                                font: { family: 'Georgia, serif', size: 11 },
                                padding: 12,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                generateLabels: (chart) => {
                                    const ds = chart.data.datasets[0];
                                    const total = ds.data.reduce((a, b) => a + b, 0);
                                    return chart.data.labels.map((label, i) => ({
                                        text: `${label}: $${fmtNum(ds.data[i])} ${baseCurrency} (${total > 0 ? ((ds.data[i] / total) * 100).toFixed(1) : 0}%)`,
                                        fillStyle: ds.backgroundColor[i],
                                        strokeStyle: '#FFF',
                                        lineWidth: 1,
                                        index: i
                                    }));
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: `Distribución de Gastos (${baseCurrency})`,
                            color: '#1a1a1a',
                            font: { family: 'Georgia, serif', size: 16, weight: 'bold' },
                            padding: { top: 10, bottom: 15 }
                        },
                        tooltip: { enabled: false }
                    }
                },
                plugins: [datalabelPlugin, {
                    id: 'exportWhiteBg',
                    beforeDraw(chart) {
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, chart.width, chart.height);
                        ctx.restore();
                    }
                }]
            }, 800, 550);

            // Guardar datos de leyenda para la tabla Word
            chartBuffers.expensesLegend = expLabels.map((name, i) => ({
                name,
                amount: expData[i],
                pct: totalExpenses > 0 ? ((expData[i] / totalExpenses) * 100).toFixed(1) : '0.0',
                color: expColors[i]
            }));
        }

        // ──────────── GRÁFICO 2: EVOLUCIÓN DEL PATRIMONIO (LÍNEA) ────────────
        // Evolución del patrimonio por mes (retrospectivo simplificado)
        let runningNW = 0;
        accounts.forEach(acc => {
            const rate = rates[acc.currency] || 1;
            runningNW += parseFloat(acc.balance || 0) / rate;
        });

        // Calcular patrimonio mensual retrospectivo
        const sortedTxDesc = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        const monthSet = new Set();
        sortedTxDesc.forEach(tx => {
            const d = new Date(tx.date);
            if (isNaN(d.getTime())) return;
            const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthSet.add(mk);
        });
        
        // Construir serie mensual
        const allMonths = [...monthSet].sort();
        if (allMonths.length > 1) {
            const monthlyIncome = {};
            const monthlyExpense = {};
            transactions.forEach(tx => {
                if (tx.type === 'transfer' || tx.category_id === 'transfer') return;
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                if (!cat) return;
                const d = new Date(tx.date);
                if (isNaN(d.getTime())) return;
                const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                const currency = acc ? acc.currency : baseCurrency;
                const rate = rates[currency] || 1;
                const amountInBase = parseFloat(tx.amount || 0) / rate;
                if (cat.type === 'income') {
                    monthlyIncome[mk] = (monthlyIncome[mk] || 0) + amountInBase;
                } else if (cat.type === 'expense') {
                    monthlyExpense[mk] = (monthlyExpense[mk] || 0) + amountInBase;
                }
            });

            const sortedM = [...new Set([...Object.keys(monthlyIncome), ...Object.keys(monthlyExpense)])].sort();
            
            if (sortedM.length >= 2) {
                // Construir serie acumulativa retrospectiva
                let cumulativeNW = runningNW;
                const nwSeries = [];
                
                for (let i = sortedM.length - 1; i >= 0; i--) {
                    nwSeries.unshift({ x: sortedM[i], y: parseFloat(cumulativeNW.toFixed(2)) });
                    cumulativeNW = cumulativeNW - (monthlyIncome[sortedM[i]] || 0) + (monthlyExpense[sortedM[i]] || 0);
                }

                // Línea de tendencia
                const trendData = [];
                const n = nwSeries.length;
                if (n > 1) {
                    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                    for (let i = 0; i < n; i++) {
                        sumX += i; sumY += nwSeries[i].y;
                        sumXY += i * nwSeries[i].y; sumX2 += i * i;
                    }
                    const denom = (n * sumX2 - sumX * sumX);
                    const m = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
                    const c = (sumY - m * sumX) / n;
                    for (let i = 0; i < n; i++) {
                        trendData.push({ x: nwSeries[i].x, y: parseFloat((m * i + c).toFixed(2)) });
                    }
                }

                chartBuffers.netWorth = this.renderOffscreenChart({
                    type: 'line',
                    data: {
                        labels: nwSeries.map(p => p.x),
                        datasets: [
                            {
                                label: `Patrimonio Neto (${baseCurrency})`,
                                data: nwSeries.map(p => p.y),
                                borderColor: '#2E5090',
                                backgroundColor: 'rgba(46, 80, 144, 0.1)',
                                fill: 'start',
                                tension: 0.3,
                                borderWidth: 3,
                                pointRadius: 4,
                                pointBackgroundColor: '#2E5090',
                                pointBorderColor: '#FFF',
                                pointBorderWidth: 2
                            },
                            {
                                label: 'Tendencia',
                                data: trendData.map(p => p.y),
                                borderColor: '#999',
                                borderWidth: 1.5,
                                borderDash: [6, 4],
                                fill: false,
                                pointRadius: 0,
                                tension: 0
                            }
                        ]
                    },
                    options: {
                        responsive: false,
                        animation: false,
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { color: '#555', font: { family: 'Georgia, serif', size: 11 } }
                            },
                            y: {
                                beginAtZero: false,
                                grid: { color: 'rgba(0,0,0,0.08)' },
                                ticks: {
                                    color: '#555',
                                    font: { family: 'Georgia, serif', size: 11 },
                                    callback: (val) => `$${Math.abs(val).toLocaleString('es-ES')}`
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: { color: '#333', font: { family: 'Georgia, serif', size: 11 }, usePointStyle: true }
                            },
                            title: {
                                display: true,
                                text: `Evolución del Patrimonio Neto (${baseCurrency})`,
                                color: '#1a1a1a',
                                font: { family: 'Georgia, serif', size: 16, weight: 'bold' },
                                padding: { top: 10, bottom: 15 }
                            },
                            tooltip: { enabled: false }
                        }
                    },
                    plugins: [{
                        id: 'exportWhiteBg',
                        beforeDraw(chart) {
                            const ctx = chart.ctx;
                            ctx.save();
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillRect(0, 0, chart.width, chart.height);
                            ctx.restore();
                        }
                    }]
                }, 800, 450);
            }
        }

        // ──────────── GRÁFICO 3: REGLA 50/30/20 (DONA) ────────────
        let totalIncomeReal = 0, totalNeeds = 0, totalWants = 0, totalSavings = 0;

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
                        if (cat.subtype === 'variable') totalWants += amountInBase;
                        else totalNeeds += amountInBase;
                    }
                }
            }
        });

        // Calcular flujo neto de cuentas Ahorro/Deuda
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
                            if (cat.type === 'income') accNetFlow += amountInBase;
                            else if (cat.type === 'expense') accNetFlow -= amountInBase;
                        }
                    }
                }
            });
            if (accNetFlow > 0) totalSavings += accNetFlow;
        });

        const totalZBB = totalNeeds + totalWants + totalSavings;
        if (totalZBB > 0) {
            const zbbColors = ['#2B4570', '#D9785F', '#5A9367'];
            const zbbLabels = ['Necesidades', 'Deseos', 'Futuro'];
            const zbbData = [parseFloat(totalNeeds.toFixed(2)), parseFloat(totalWants.toFixed(2)), parseFloat(totalSavings.toFixed(2))];
            const totalIncomeBase = totalIncomeReal > 0 ? totalIncomeReal : totalZBB;

            const zbbDatalabelPlugin = {
                id: 'zbbDatalabels',
                afterDraw(chart) {
                    const ctx = chart.ctx;
                    const dataset = chart.data.datasets[0];
                    const meta = chart.getDatasetMeta(0);
                    const total = dataset.data.reduce((a, b) => a + b, 0);
                    
                    meta.data.forEach((arc, i) => {
                        const pct = total > 0 ? ((dataset.data[i] / total) * 100) : 0;
                        if (pct < 3) return;
                        
                        const centerAngle = (arc.startAngle + arc.endAngle) / 2;
                        const radius = (arc.innerRadius + arc.outerRadius) / 2;
                        const x = arc.x + Math.cos(centerAngle) * radius;
                        const y = arc.y + Math.sin(centerAngle) * radius;
                        
                        ctx.save();
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = 'bold 14px Georgia, serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = 'rgba(0,0,0,0.6)';
                        ctx.shadowBlur = 3;
                        ctx.fillText(`${pct.toFixed(1)}%`, x, y);
                        ctx.restore();
                    });
                }
            };

            chartBuffers.zbbRule = this.renderOffscreenChart({
                type: 'doughnut',
                data: {
                    labels: zbbLabels,
                    datasets: [{
                        data: zbbData,
                        backgroundColor: zbbColors,
                        borderColor: '#FFFFFF',
                        borderWidth: 3
                    }]
                },
                options: {
                    responsive: false,
                    animation: false,
                    layout: { padding: { bottom: 10 } },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: '#333',
                                font: { family: 'Georgia, serif', size: 12 },
                                padding: 14,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                generateLabels: (chart) => {
                                    const ds = chart.data.datasets[0];
                                    const idealPcts = [50, 30, 20];
                                    return chart.data.labels.map((label, i) => {
                                        const pct = totalIncomeBase > 0 ? ((ds.data[i] / totalIncomeBase) * 100).toFixed(1) : '0.0';
                                        return {
                                            text: `${label}: $${fmtNum(ds.data[i])} ${baseCurrency} (${pct}% — Meta: ${idealPcts[i]}%)`,
                                            fillStyle: ds.backgroundColor[i],
                                            strokeStyle: '#FFF',
                                            lineWidth: 1,
                                            index: i
                                        };
                                    });
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: `Estructura Presupuestaria 50/30/20 (${baseCurrency})`,
                            color: '#1a1a1a',
                            font: { family: 'Georgia, serif', size: 16, weight: 'bold' },
                            padding: { top: 10, bottom: 15 }
                        },
                        tooltip: { enabled: false }
                    }
                },
                plugins: [zbbDatalabelPlugin, {
                    id: 'exportWhiteBg',
                    beforeDraw(chart) {
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, chart.width, chart.height);
                        ctx.restore();
                    }
                }]
            }, 800, 550);

            // Guardar datos de leyenda para tabla Word
            chartBuffers.zbbLegend = zbbLabels.map((name, i) => ({
                name,
                amount: zbbData[i],
                pct: totalIncomeBase > 0 ? ((zbbData[i] / totalIncomeBase) * 100).toFixed(1) : '0.0',
                ideal: [50, 30, 20][i],
                color: zbbColors[i]
            }));
        }

        return chartBuffers;
    },

    // Compilar métricas financieras del periodo
    compileMetrics(startDate, endDate) {
        const { transactions, categories, accounts, settings } = State.db;
        const baseCurrency = settings.baseCurrency || 'USD';
        const rates = settings.exchangeRates || {};

        // Filtrar transacciones del periodo (conservando transferencias para el cálculo del costo)
        const filteredTx = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });

        let income = 0;
        let expenses = 0;
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
            } else {
                const cat = categories.find(c => String(c.id) === String(tx.category_id));
                if (!cat) return;
                const acc = accounts.find(a => String(a.id) === String(tx.account_id));
                const currency = acc ? acc.currency : baseCurrency;
                const rate = rates[currency] || 1;
                const amountInBase = parseFloat(tx.amount || 0) / rate;

                if (cat.type === 'income') {
                    income += amountInBase;
                } else if (cat.type === 'expense') {
                    expenses += amountInBase;
                }
            }
        });

        const netFlow = income - expenses;
        const savingsRate = income > 0 ? (netFlow / income) * 100 : 0;

        // Calcular Burn Rate y Runway
        let liquidFunds = 0;
        accounts.forEach(acc => {
            if (acc.type === 'checking' || acc.type === 'savings' || acc.type === 'cash') {
                const rate = rates[acc.currency] || 1;
                liquidFunds += parseFloat(acc.balance || 0) / rate;
            }
        });

        let runway = 'N/A';
        if (netFlow < 0) {
            const burnRate = Math.abs(netFlow);
            runway = burnRate > 0 ? (liquidFunds / burnRate).toFixed(1) : 'N/A';
        } else {
            runway = '∞';
        }

        return {
            income,
            expenses,
            netFlow,
            savingsRate,
            liquidFunds,
            runway,
            totalTransferLoss,
            baseCurrency
        };
    },

    exportToExcel(startDate, endDate) {
        console.log("ExportService: Generando archivo Excel...");
        const { transactions, categories, accounts, settings } = State.db;
        const baseCurrency = settings.baseCurrency || 'USD';
        const rates = settings.exchangeRates || {};

        // Filtrar transacciones del periodo
        const filteredTx = transactions.filter(tx => {
            const txDate = new Date(tx.date);
            if (startDate && txDate < startDate) return false;
            if (endDate && txDate > endDate) return false;
            return true;
        });

        const metrics = this.compileMetrics(startDate, endDate);

        // --- HOJA 1: RESUMEN EJECUTIVO ---
        const summaryData = [
            ['INFORME FINANCIERO CONSOLIDADO'],
            ['Periodo:', `${this.toReadableDate(this.toLocalDateStr(startDate || new Date(0)))} - ${this.toReadableDate(this.toLocalDateStr(endDate || new Date()))}`],
            ['Moneda Base:', baseCurrency],
            ['Fecha de Emisión:', new Date().toLocaleDateString('es-ES')],
            [],
            ['KPIs CLAVE DEL PERIODO'],
            ['Métrica', 'Valor Consolidado', 'Unidad'],
            ['Ingresos Totales', this.formatNumber(metrics.income), baseCurrency],
            ['Gastos Totales', this.formatNumber(metrics.expenses), baseCurrency],
            ['Flujo Neto', this.formatNumber(metrics.netFlow), baseCurrency],
            ['Tasa de Ahorro Neto', this.formatNumber(metrics.savingsRate) + '%', 'Porcentaje'],
            ['Runway de Caja', metrics.runway === '∞' ? 'Ilimitado' : metrics.runway, metrics.runway === '∞' ? '' : 'Meses'],
            ['Costo por Conversión/Comisión en Transferencias', this.formatNumber(metrics.totalTransferLoss), baseCurrency],
            ['Efectivo Líquido Disponible', this.formatNumber(metrics.liquidFunds), baseCurrency]
        ];

        // --- HOJA 2: LIBRO MAYOR DE TRANSACCIONES ---
        const txHeaders = ['Fecha', 'Tipo', 'Categoría', 'Cuenta Origen', 'Cuenta Destino', 'Monto Original', 'Divisa', 'Monto Base (' + baseCurrency + ')', 'Monto USD', 'Concepto / Nota'];
        const txRows = filteredTx.map(tx => {
            let acc, toAcc, cat;
            let currency = baseCurrency;
            let amountOriginal = 0;
            let amountInBase = 0;
            let tipoText = 'Transferencia';

            if (tx.type === 'transfer') {
                // Mapeo específico de transferencia
                acc = accounts.find(a => String(a.id) === String(tx.from_account_id));
                if (!acc && tx.from_profile_id && State.profilesState && State.profilesState.profiles) {
                    const sourceProfile = State.profilesState.profiles.find(p => String(p.id) === String(tx.from_profile_id));
                    if (sourceProfile) {
                        acc = sourceProfile.db.accounts.find(a => String(a.id) === String(tx.from_account_id));
                    }
                }
                
                toAcc = accounts.find(a => String(a.id) === String(tx.to_account_id));
                if (!toAcc && tx.to_profile_id && State.profilesState && State.profilesState.profiles) {
                    const targetProfile = State.profilesState.profiles.find(p => String(p.id) === String(tx.to_profile_id));
                    if (targetProfile) {
                        toAcc = targetProfile.db.accounts.find(a => String(a.id) === String(tx.to_account_id));
                    }
                }

                currency = acc ? acc.currency : baseCurrency;
                amountOriginal = parseFloat(tx.amount_extracted || 0);
                
                const rate = rates[currency] || 1;
                amountInBase = amountOriginal / rate;
            } else {
                // Mapeo de transacción estándar
                acc = accounts.find(a => String(a.id) === String(tx.account_id));
                cat = categories.find(c => String(c.id) === String(tx.category_id));
                
                currency = acc ? acc.currency : baseCurrency;
                amountOriginal = parseFloat(tx.amount || 0);
                
                const rate = rates[currency] || 1;
                amountInBase = amountOriginal / rate;

                if (cat) {
                    tipoText = cat.type === 'income' ? 'Ingreso' : 'Gasto';
                }
            }

            // Conversión a USD standard
            const usdRate = rates['USD'] || 1;
            const amountInUSD = amountInBase * usdRate;
            
            return [
                tx.date,
                tipoText,
                cat ? cat.name : (tx.type === 'transfer' ? 'Transferencia' : 'N/A'),
                acc ? acc.name : 'N/A',
                toAcc ? toAcc.name : '',
                this.formatNumber(amountOriginal),
                currency,
                this.formatNumber(amountInBase),
                this.formatNumber(amountInUSD),
                tx.note || ''
            ];
        });

        // --- HOJA 3: DISTRIBUCIÓN POR CATEGORÍAS ---
        const incomeCats = {};
        const expenseCats = {};
        
        filteredTx.forEach(tx => {
            if (tx.type === 'transfer') return;
            const cat = categories.find(c => String(c.id) === String(tx.category_id));
            if (!cat) return;

            const acc = accounts.find(a => String(a.id) === String(tx.account_id));
            const currency = acc ? acc.currency : baseCurrency;
            const rate = rates[currency] || 1;
            const amountInBase = parseFloat(tx.amount || 0) / rate;

            if (cat.type === 'income') {
                incomeCats[cat.name] = (incomeCats[cat.name] || 0) + amountInBase;
            } else if (cat.type === 'expense') {
                expenseCats[cat.name] = (expenseCats[cat.name] || 0) + amountInBase;
            }
        });

        const categoryData = [['DISTRIBUCIÓN POR CATEGORÍAS (INGRESOS Y GASTOS)'], []];
        
        categoryData.push(['INGRESOS POR CATEGORÍA']);
        categoryData.push(['Categoría', 'Total Consolidado', '% del Total']);
        Object.entries(incomeCats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([name, val]) => {
                const pct = metrics.income > 0 ? (val / metrics.income) * 100 : 0;
                categoryData.push([name, this.formatNumber(val), this.formatNumber(pct) + '%']);
            });

        categoryData.push([], ['GASTOS POR CATEGORÍA']);
        categoryData.push(['Categoría', 'Total Consolidado', '% del Total']);
        Object.entries(expenseCats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([name, val]) => {
                const pct = metrics.expenses > 0 ? (val / metrics.expenses) * 100 : 0;
                categoryData.push([name, this.formatNumber(val), this.formatNumber(pct) + '%']);
            });

        // --- HOJA 4: MODELO PREDICTIVO ---
        const monthlyExpenses = {};
        transactions.forEach(t => {
            if (t.category_id === 'transfer' || t.type === 'transfer') return;
            const cat = categories.find(c => String(c.id) === String(t.category_id));
            const isExpense = t.type === 'expense' || (cat && cat.type === 'expense');
            if (!isExpense) return;

            const d = new Date(t.date);
            if (isNaN(d.getTime())) return;
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            
            const acc = accounts.find(a => String(a.id) === String(t.account_id));
            const currency = acc ? acc.currency : baseCurrency;
            const rate = rates[currency] || 1;
            monthlyExpenses[monthKey] = (monthlyExpenses[monthKey] || 0) + (parseFloat(t.amount || 0) / rate);
        });

        const sortedMonths = Object.keys(monthlyExpenses).sort();
        const N = sortedMonths.length;
        
        const predictiveData = [['MODELO PREDICTIVO DE GASTOS FUTUROS'], []];
        
        if (N >= 2) {
            let forecast = 0;
            if (N >= 3) {
                const m1 = monthlyExpenses[sortedMonths[N-1]];
                const m2 = monthlyExpenses[sortedMonths[N-2]];
                const m3 = monthlyExpenses[sortedMonths[N-3]];
                forecast = (m1 * 3 + m2 * 2 + m3 * 1) / 6;
            } else {
                const m1 = monthlyExpenses[sortedMonths[N-1]];
                const m2 = monthlyExpenses[sortedMonths[N-2]];
                forecast = (m1 * 2 + m2 * 1) / 3;
            }

            let sumExp = 0;
            sortedMonths.forEach(m => { sumExp += monthlyExpenses[m]; });
            const avgExp = sumExp / N;
            let varianceSum = 0;
            sortedMonths.forEach(m => { varianceSum += Math.pow(monthlyExpenses[m] - avgExp, 2); });
            let stdDev = Math.sqrt(varianceSum / N);
            if (stdDev < (forecast * 0.05)) stdDev = forecast * 0.08;

            predictiveData.push(['MODELO MATEMÁTICO: MEDIA MÓVIL PONDERADA (WMA-3)']);
            predictiveData.push(['Métrica Predictiva', 'Valor Estimado', 'Moneda']);
            predictiveData.push(['Gasto Proyectado Próximo Mes', this.formatNumber(forecast), baseCurrency]);
            predictiveData.push(['Rango Inferior Esperado', this.formatNumber(Math.max(0, forecast - stdDev)), baseCurrency]);
            predictiveData.push(['Rango Superior Esperado', this.formatNumber(forecast + stdDev), baseCurrency]);
            predictiveData.push(['Volatilidad Histórica (Desv. Est.)', this.formatNumber(stdDev), baseCurrency]);
            
            predictiveData.push([], ['HISTORIAL DE GASTOS MENSUALES']);
            predictiveData.push(['Mes', 'Gasto Total (' + baseCurrency + ')']);
            sortedMonths.forEach(m => {
                predictiveData.push([m, this.formatNumber(monthlyExpenses[m])]);
            });
        } else {
            predictiveData.push(['Se requieren al menos 2 meses de datos para habilitar el modelo predictivo.']);
        }

        // --- COMPILAR LIBRO DE EXCEL ---
        const wb = XLSX.utils.book_new();
        
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        const wsTx = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);
        const wsCat = XLSX.utils.aoa_to_sheet(categoryData);
        const wsPredict = XLSX.utils.aoa_to_sheet(predictiveData);

        XLSX.utils.book_append_sheet(wb, wsSummary, 'Dashboard');
        XLSX.utils.book_append_sheet(wb, wsTx, 'Libro Mayor');
        XLSX.utils.book_append_sheet(wb, wsCat, 'Categorías');
        XLSX.utils.book_append_sheet(wb, wsPredict, 'Modelo Predictivo');

        // Generar descarga
        const filename = `Informe_Financiero_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        console.log("ExportService: Excel descargado con éxito.");
    },

    exportToWord(startDate, endDate) {
        console.log("ExportService: Generando archivo Word (.docx)...");
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel, AlignmentType, WidthType, BorderStyle } = window.docx;

        const metrics = this.compileMetrics(startDate, endDate);
        const startStr = this.toReadableDate(this.toLocalDateStr(startDate || new Date(0)));
        const endStr = this.toReadableDate(this.toLocalDateStr(endDate || new Date()));

        // Generar gráficos offscreen profesionales
        const chartBuffers = this.buildExportCharts(startDate, endDate);

        // Evaluar diagnósticos cualitativos de salud financiera
        let savingsDiagnostic = '';
        if (metrics.savingsRate > 20) {
            savingsDiagnostic = 'Excelente. Estás ahorrando en un nivel ideal, permitiéndote acumular excedentes operativos de forma muy sólida.';
        } else if (metrics.savingsRate >= 0) {
            savingsDiagnostic = 'Aceptable. Tienes ahorro positivo, pero se recomienda revisar gastos variables para optimizar tu capacidad de retención.';
        } else {
            savingsDiagnostic = 'Alerta de Déficit. Estás gastando más de tus ingresos en este periodo. Requiere recortar costos variables.';
        }

        let runwayDiagnostic = '';
        if (metrics.runway === '∞') {
            runwayDiagnostic = 'Saludable. Al tener flujo neto positivo, tu Runway es virtualmente ilimitado.';
        } else {
            const runwayNum = parseFloat(metrics.runway);
            if (runwayNum >= 6) {
                runwayDiagnostic = 'Seguro. Posees reservas de liquidez suficientes para más de 6 meses bajo el ritmo de gasto actual.';
            } else if (runwayNum >= 3) {
                runwayDiagnostic = 'Precaución. Tus reservas te garantizan entre 3 y 6 meses. Evita comprometer nuevos costos fijos.';
            } else {
                runwayDiagnostic = 'Alerta Crítica. Tus fondos líquidos se agotarán en menos de 3 meses. Requiere recortar egresos urgentes.';
            }
        }

        // 1. Portada y Resumen Ejecutivo
        const docChildren = [
            // Título Principal
            new Paragraph({
                text: "INFORME DE DESEMPEÑO FINANCIERO Y PROYECCIONES",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { before: 800, after: 300 }
            }),
            new Paragraph({
                text: `Periodo del Análisis: ${startStr} al ${endStr}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: `Fecha de Generación: ${new Date().toLocaleDateString('es-ES')}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 600 }
            }),
            new Paragraph({
                text: `Moneda de Consolidación: ${metrics.baseCurrency}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 2000 }
            }),
            new Paragraph({
                text: "CONFIDENCIAL - USO INTERNO",
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 }
            }),
            
            // Sección 1: Resumen Ejecutivo
            new Paragraph({
                text: "1. RESUMEN EJECUTIVO",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun("El presente informe compila el desempeño financiero consolidado obtenido durante el periodo de análisis. Este análisis excluye transferencias internas de capital entre tus cuentas para asegurar una visión transparente del flujo neto real. El saldo neto de liquidez consolidado del usuario al cierre se detalla a continuación.")
                ],
                spacing: { after: 200 }
            }),

            // Tabla de KPIs
            new Table({
                width: {
                    size: 100,
                    type: WidthType.PERCENTAGE
                },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Indicador Financiero", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Valor Consolidado", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Diagnóstico / Estado", bold: true })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Ingresos Totales" })] }),
                            new TableCell({ children: [new Paragraph({ text: `$${this.formatNumber(metrics.income)} ${metrics.baseCurrency}` })] }),
                            new TableCell({ children: [new Paragraph({ text: "Flujo bruto de entradas." })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Gastos Totales" })] }),
                            new TableCell({ children: [new Paragraph({ text: `$${this.formatNumber(metrics.expenses)} ${metrics.baseCurrency}` })] }),
                            new TableCell({ children: [new Paragraph({ text: "Flujo bruto de salidas." })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Flujo Neto" })] }),
                            new TableCell({ children: [new Paragraph({ text: `$${this.formatNumber(metrics.netFlow)} ${metrics.baseCurrency}` })] }),
                            new TableCell({ children: [new Paragraph({ text: metrics.netFlow >= 0 ? "Superávit de caja." : "Déficit de caja." })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Tasa de Ahorro" })] }),
                            new TableCell({ children: [new Paragraph({ text: `${this.formatNumber(metrics.savingsRate)}%` })] }),
                            new TableCell({ children: [new Paragraph({ text: savingsDiagnostic })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Runway de Caja" })] }),
                            new TableCell({ children: [new Paragraph({ text: metrics.runway === '∞' ? 'Ilimitado (∞)' : `${metrics.runway} Meses` })] }),
                            new TableCell({ children: [new Paragraph({ text: runwayDiagnostic })] })
                        ]
                    })
                ]
            }),

            // Sección 2: Análisis Estructural por Categorías
            new Paragraph({
                text: "2. ANÁLISIS ESTRUCTURAL DE CATEGORÍAS",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
                text: "A continuación, se detalla visualmente y en formato tabular la distribución y desglose de tus flujos de caja del periodo.",
                spacing: { after: 200 }
            })
        ];

        // Inserción del Gráfico Offscreen de Distribución de Gastos
        if (chartBuffers.expenses) {
            docChildren.push(
                new Paragraph({
                    text: "Gráfico 1. Distribución Consolidada de Gastos del Periodo",
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 100 }
                }),
                new Paragraph({
                    children: [
                        new ImageRun({
                            data: chartBuffers.expenses,
                            type: 'png',
                            transformation: {
                                width: 500,
                                height: 340
                            }
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                })
            );

            // Tabla-Leyenda de Categorías de Gastos
            if (chartBuffers.expensesLegend && chartBuffers.expensesLegend.length > 0) {
                const legendRows = [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Categoría", bold: true })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Monto (${metrics.baseCurrency})`, bold: true })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "% del Total", bold: true })] })] })
                        ]
                    })
                ];

                chartBuffers.expensesLegend.forEach(item => {
                    legendRows.push(new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `● ${item.name}`, color: item.color.replace('#', '') })] })] }),
                            new TableCell({ children: [new Paragraph({ text: `$${this.formatNumber(item.amount)}` })] }),
                            new TableCell({ children: [new Paragraph({ text: `${item.pct}%` })] })
                        ]
                    }));
                });

                docChildren.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: legendRows
                }));
            }
        }

        if (metrics.totalTransferLoss > 0.01) {
            docChildren.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: "Costo por Conversión/Comisión en Transferencias: ", bold: true }),
                        new TextRun(`Se registró una pérdida total acumulada de $${this.formatNumber(metrics.totalTransferLoss)} ${metrics.baseCurrency} debido a diferencias en el tipo de cambio o comisiones bancarias durante las transferencias internas del periodo. Este valor representa la fricción operativa del movimiento de capital.`)
                    ],
                    spacing: { before: 150, after: 150 }
                })
            );
        }

        // Sección 3: Análisis Comparativo Temporal (MoM / YoY)
        docChildren.push(
            new Paragraph({
                text: "3. ANÁLISIS COMPARATIVO TEMPORAL",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
                text: "Este análisis evalúa el desempeño del periodo actual comparándolo frente al periodo anterior equivalente (Mes sobre Mes / MoM) y frente al mismo periodo del año pasado (Año sobre Año / YoY).",
                spacing: { after: 200 }
            })
        );

        // Inserción de Gráfico Offscreen del Patrimonio Neto
        if (chartBuffers.netWorth) {
            docChildren.push(
                new Paragraph({
                    text: "Gráfico 2. Evolución Histórica del Patrimonio y Saldos",
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 100 }
                }),
                new Paragraph({
                    children: [
                        new ImageRun({
                            data: chartBuffers.netWorth,
                            type: 'png',
                            transformation: {
                                width: 500,
                                height: 280
                            }
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 }
                })
            );
        }

        // Sección 4: Modelos Predictivos y Recomendaciones
        docChildren.push(
            new Paragraph({
                text: "4. MODELOS PREDICTIVOS Y PROYECCIONES DE CONSUMO",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
                text: "Utilizando una Media Móvil Ponderada (WMA) de 3 meses basada en tu volatilidad e historial de transacciones, estimamos los egresos futuros del próximo mes para predecir posibles riesgos de liquidez.",
                spacing: { after: 200 }
            })
        );

        // Inserción de Gráfico Offscreen de Regla 50/30/20
        if (chartBuffers.zbbRule) {
            docChildren.push(
                new Paragraph({
                    text: "Gráfico 3. Estructura Presupuestaria y Proporción 50/30/20",
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 100, after: 100 }
                }),
                new Paragraph({
                    children: [
                        new ImageRun({
                            data: chartBuffers.zbbRule,
                            type: 'png',
                            transformation: {
                                width: 500,
                                height: 340
                            }
                        })
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                })
            );

            // Tabla-Leyenda del 50/30/20
            if (chartBuffers.zbbLegend && chartBuffers.zbbLegend.length > 0) {
                const zbbLegendRows = [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Segmento", bold: true })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Monto (${metrics.baseCurrency})`, bold: true })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "% Real", bold: true })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "% Meta", bold: true })] })] })
                        ]
                    })
                ];

                chartBuffers.zbbLegend.forEach(item => {
                    zbbLegendRows.push(new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `● ${item.name}`, color: item.color.replace('#', '') })] })] }),
                            new TableCell({ children: [new Paragraph({ text: `$${this.formatNumber(item.amount)}` })] }),
                            new TableCell({ children: [new Paragraph({ text: `${item.pct}%` })] }),
                            new TableCell({ children: [new Paragraph({ text: `${item.ideal}%` })] })
                        ]
                    }));
                });

                docChildren.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: zbbLegendRows
                }));
            }
        }

        // Compilar predicción para DOCX
        const { transactions } = State.db;
        const rates = State.db.settings.exchangeRates || {};
        const monthlyExpenses = {};
        transactions.forEach(t => {
            if (t.category_id === 'transfer' || t.type === 'transfer') return;
            const cat = State.db.categories.find(c => String(c.id) === String(t.category_id));
            const isExpense = t.type === 'expense' || (cat && cat.type === 'expense');
            if (!isExpense) return;

            const d = new Date(t.date);
            if (isNaN(d.getTime())) return;
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            
            const acc = State.db.accounts.find(a => String(a.id) === String(t.account_id));
            const currency = acc ? acc.currency : metrics.baseCurrency;
            const rate = rates[currency] || 1;
            monthlyExpenses[monthKey] = (monthlyExpenses[monthKey] || 0) + (parseFloat(t.amount || 0) / rate);
        });

        const sortedMonths = Object.keys(monthlyExpenses).sort();
        const N = sortedMonths.length;

        if (N >= 2) {
            let forecast = 0;
            if (N >= 3) {
                const m1 = monthlyExpenses[sortedMonths[N-1]];
                const m2 = monthlyExpenses[sortedMonths[N-2]];
                const m3 = monthlyExpenses[sortedMonths[N-3]];
                forecast = (m1 * 3 + m2 * 2 + m3 * 1) / 6;
            } else {
                const m1 = monthlyExpenses[sortedMonths[N-1]];
                const m2 = monthlyExpenses[sortedMonths[N-2]];
                forecast = (m1 * 2 + m2 * 1) / 3;
            }

            let sumExp = 0;
            sortedMonths.forEach(m => { sumExp += monthlyExpenses[m]; });
            const avgExp = sumExp / N;
            let varianceSum = 0;
            sortedMonths.forEach(m => { varianceSum += Math.pow(monthlyExpenses[m] - avgExp, 2); });
            const stdDev = Math.sqrt(varianceSum / N);

            const isRisky = forecast > (metrics.income || avgExp);

            docChildren.push(
                new Paragraph({
                    text: `Gasto Proyectado para el Próximo Mes: $${this.formatNumber(forecast)} ${metrics.baseCurrency}`,
                    bold: true,
                    spacing: { before: 100, after: 100 }
                }),
                new Paragraph({
                    text: `Rango Estimado Esperado: $${this.formatNumber(Math.max(0, forecast - stdDev))} a $${this.formatNumber(forecast + stdDev)} ${metrics.baseCurrency}`,
                    spacing: { after: 150 }
                }),
                new Paragraph({
                    text: isRisky ? 
                        "⚠️ RECOMENDACIÓN ESTRATÉGICA: El modelo detecta que el gasto proyectado excede tus ingresos mensuales promedio recientes. Se sugiere restringir gastos variables y posponer compras extraordinarias para evitar un déficit de caja en el próximo periodo." : 
                        "✅ RECOMENDACIÓN ESTRATÉGICA: El modelo estima que tus gastos se mantendrán dentro del rango promedio sostenible de tus ingresos. Mantén tu comportamiento presupuestario actual para conservar tu ritmo de ahorro positivo.",
                    bold: true,
                    spacing: { before: 200, after: 200 }
                })
            );
        }

        // Crear documento final
        const doc = new Document({
            sections: [{
                properties: {},
                children: docChildren
            }]
        });

        // Generar descarga
        Packer.toBlob(doc).then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Reporte_Financiero_Socios_${new Date().toISOString().slice(0, 10)}.docx`;
            a.click();
            window.URL.revokeObjectURL(url);
            console.log("ExportService: Word (.docx) descargado con éxito.");
        }).catch(err => {
            console.error("Fallo al empaquetar DOCX:", err);
        });
    }
};
