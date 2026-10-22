// services/printService.ts
// Impressão multi-impressora via QZ Tray (https://qz.io).
// O QZ Tray é um app que roda no computador do caixa e deixa o navegador
// imprimir direto numa impressora específica, sem abrir a janela de impressão.
//
// Instalação no projeto:  npm install qz-tray
// Instalação no PC:       baixar e instalar o QZ Tray em https://qz.io/download

import qz from 'qz-tray';

export type PrintTarget = 'cashier' | 'kitchen';

export interface PrinterRoute {
    enabled: boolean;
    printerName: string; // nome exato da impressora no sistema operacional
    copies: number;
}

export interface PrintConfig {
    cashier: PrinterRoute;
    kitchen: PrinterRoute;
}

const STORAGE_KEY = 'chegoou_print_config_v1';

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
    cashier: { enabled: false, printerName: '', copies: 1 },
    kitchen: { enabled: false, printerName: '', copies: 1 },
};

// A configuração fica no localStorage porque as impressoras pertencem
// a CADA computador (o caixa e a cozinha podem ter PCs diferentes).
export const loadPrintConfig = (): PrintConfig => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_PRINT_CONFIG;
        const parsed = JSON.parse(raw);
        return {
            cashier: { ...DEFAULT_PRINT_CONFIG.cashier, ...(parsed.cashier || {}) },
            kitchen: { ...DEFAULT_PRINT_CONFIG.kitchen, ...(parsed.kitchen || {}) },
        };
    } catch {
        return DEFAULT_PRINT_CONFIG;
    }
};

export const savePrintConfig = (config: PrintConfig) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch { /* storage indisponível */ }
};

// Certificado: sem assinatura, o QZ mostra um aviso na 1ª vez ("Allow" + "Remember").
// Marcando "Remember this decision" ele não pergunta mais naquele computador.
qz.security.setCertificatePromise((resolve: (v: string) => void) => resolve(''));
qz.security.setSignaturePromise(() => (resolve: (v: string) => void) => resolve(''));

let connecting: Promise<void> | null = null;

export const ensureConnected = async (): Promise<void> => {
    if (qz.websocket.isActive()) return;
    if (!connecting) {
        connecting = qz.websocket
            .connect({ retries: 2, delay: 1 })
            .finally(() => { connecting = null; });
    }
    await connecting;
};

export const listPrinters = async (): Promise<string[]> => {
    await ensureConnected();
    const found = await qz.printers.find();
    return Array.isArray(found) ? found : [found];
};

const printOnePrinter = async (printerName: string, html: string, copies: number) => {
    await ensureConnected();
    const config = qz.configs.create(printerName, {
        copies: Math.max(1, copies),
        margins: 0,
        units: 'mm',
        scaleContent: true,
    });
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
};

export interface PrintJob {
    target: PrintTarget;
    html: string;
}

/**
 * Envia todos os jobs EM PARALELO (cozinha e caixa ao mesmo tempo).
 * Retorna quais destinos falharam, para o chamador decidir o fallback.
 */
export const printToConfiguredPrinters = async (
    config: PrintConfig,
    jobs: PrintJob[]
): Promise<{ target: PrintTarget; error: string }[]> => {
    const active = jobs.filter(j => config[j.target].enabled && config[j.target].printerName);
    const results = await Promise.allSettled(
        active.map(j => printOnePrinter(config[j.target].printerName, j.html, config[j.target].copies))
    );
    const failures: { target: PrintTarget; error: string }[] = [];
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            failures.push({ target: active[i].target, error: String(r.reason?.message || r.reason) });
        }
    });
    return failures;
};

export const hasAnyPrinterConfigured = (config: PrintConfig) =>
    (config.cashier.enabled && !!config.cashier.printerName) ||
    (config.kitchen.enabled && !!config.kitchen.printerName);
