/**
 * Servicio de Calculadora
 * Permite realizar operaciones matemáticas simples en una interfaz neo-brutalista
 * e inyectar el resultado reactivamente en el input de monto correspondiente.
 */

export const CalculatorService = {
    targetInput: null,
    currentExpression: '',
    isCalculated: false,

    init() {
        console.log('CalculatorService: Inicializando...');
        
        // Asignar eventos a los botones de la calculadora
        document.querySelectorAll('.btn-calc-key').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = btn.dataset.key;
                this.handleKey(key);
            });
        });

        // Botón de aplicar resultado
        const applyBtn = document.getElementById('calc-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.apply());
        }

        // Botón de cerrar modal
        const closeBtn = document.getElementById('close-calculator-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Cerrar al hacer clic fuera del modal
        const modal = document.getElementById('calculator-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.close();
                }
            });
        }

        // Soporte premium para teclas físicas del teclado
        document.addEventListener('keydown', (e) => {
            if (!modal || modal.classList.contains('hidden')) return;

            const key = e.key;
            if (/[0-9+\-*/.]/.test(key)) {
                e.preventDefault();
                this.handleKey(key);
            } else if (key === 'Enter') {
                e.preventDefault();
                this.handleKey('=');
            } else if (key === 'Backspace') {
                e.preventDefault();
                this.handleKey('back');
            } else if (key === 'Escape') {
                e.preventDefault();
                this.close();
            } else if (key === 'c' || key === 'C' || key === 'Delete') {
                e.preventDefault();
                this.handleKey('C');
            }
        });
    },

    open(inputElement) {
        if (!inputElement) return;
        this.targetInput = inputElement;
        
        // Si el input destino ya tiene un monto válido, cargarlo como valor inicial
        const currentVal = parseFloat(inputElement.value);
        if (!isNaN(currentVal) && currentVal > 0) {
            this.currentExpression = String(currentVal);
            this.isCalculated = true; // Para que al escribir un nuevo número se sobrescriba
        } else {
            this.currentExpression = '';
            this.isCalculated = false;
        }

        this.updateDisplay();
        
        const modal = document.getElementById('calculator-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    close() {
        const modal = document.getElementById('calculator-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.targetInput = null;
    },

    handleKey(key) {
        if (key === 'C') {
            this.currentExpression = '';
            this.isCalculated = false;
        } else if (key === 'back') {
            if (this.isCalculated) {
                this.currentExpression = '';
                this.isCalculated = false;
            } else if (this.currentExpression.length > 0) {
                this.currentExpression = this.currentExpression.slice(0, -1);
            }
        } else if (key === '=') {
            this.evaluate();
            return;
        } else if (['+', '-', '*', '/'].includes(key)) {
            if (this.isCalculated) {
                this.isCalculated = false;
            }
            // Evitar operadores repetidos seguidos (ej. "++", "+*")
            if (this.currentExpression.length > 0) {
                const lastChar = this.currentExpression.slice(-1);
                if (['+', '-', '*', '/'].includes(lastChar)) {
                    // Reemplazar el último operador
                    this.currentExpression = this.currentExpression.slice(0, -1) + key;
                } else {
                    this.currentExpression += key;
                }
            } else if (key === '-') {
                // Permitir número negativo al inicio
                this.currentExpression += key;
            }
        } else { // Dígitos y punto decimal
            if (this.isCalculated) {
                this.currentExpression = '';
                this.isCalculated = false;
            }
            
            // Validaciones para el punto decimal
            if (key === '.') {
                const parts = this.currentExpression.split(/[+\-*/]/);
                const currentPart = parts[parts.length - 1];
                if (currentPart.includes('.')) {
                    return; // Ya hay un punto decimal en este número
                }
                if (currentPart === '') {
                    this.currentExpression += '0'; // Poner 0 si empieza con punto
                }
            }
            
            this.currentExpression += key;
        }

        this.updateDisplay();
    },

    updateDisplay(val = null) {
        const display = document.getElementById('calc-display');
        if (!display) return;

        if (val !== null) {
            display.textContent = val;
            return;
        }

        display.textContent = this.currentExpression || '0';
    },

    evaluate() {
        if (!this.currentExpression) return;

        let expr = this.currentExpression;
        
        // Limpiar operadores huérfanos al final de la expresión (ej. "200+")
        expr = expr.replace(/[+\-*/.]+$/, '');

        if (!expr) {
            this.currentExpression = '';
            this.updateDisplay('0');
            return;
        }

        // Sanitizar rigurosamente para evitar cualquier inyección de código arbitrario
        const sanitized = expr.replace(/[^0-9+\-*/.]/g, '');

        try {
            // Evaluar de forma segura usando Function en modo estricto
            const result = Function(`"use strict"; return (${sanitized});`)();
            
            if (result === Infinity || result === -Infinity || isNaN(result)) {
                throw new Error('División por cero o error numérico');
            }

            // Redondear a máximo 2 decimales para evitar problemas de precisión float de JS
            const finalResult = Math.round(result * 100) / 100;
            
            this.currentExpression = String(finalResult);
            this.isCalculated = true;
            this.updateDisplay();
        } catch (e) {
            console.error('Error al evaluar la expresión de la calculadora:', e);
            this.updateDisplay('Error');
            this.currentExpression = '';
            this.isCalculated = false;
        }
    },

    apply() {
        // Si hay una expresión no evaluada, evaluarla primero
        if (this.currentExpression && !this.isCalculated) {
            this.evaluate();
        }

        const displayVal = document.getElementById('calc-display').textContent;
        if (displayVal === 'Error' || !this.targetInput) {
            return;
        }

        const numericVal = parseFloat(displayVal);
        if (!isNaN(numericVal) && numericVal >= 0) {
            // Redondear a 2 decimales
            this.targetInput.value = numericVal.toFixed(2);
            
            // Disparar evento reactivo 'input' para actualizar otros componentes o validaciones
            this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        this.close();
    }
};
