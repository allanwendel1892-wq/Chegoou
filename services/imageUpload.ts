import { supabase } from './supabaseClient';

/**
 * IMAGE UPLOAD — Substitui o antigo padrão de salvar imagem em Base64
 * direto na coluna do banco (o que deixava o `select('*')` de products/
 * companies pesando dezenas de MB e travando o carregamento).
 *
 * Agora: a imagem é comprimida no navegador, enviada pro Supabase Storage,
 * e só a URL pública (uma string curta) é salva na coluna `image` /
 * `logo` / `banner`.
 *
 * PRÉ-REQUISITO (fazer uma vez só, no painel do Supabase):
 * 1. Storage > Create bucket:
 *      - nome: "products"   -> marcar como Public
 *      - nome: "companies"  -> marcar como Public
 * 2. Em cada bucket, Policies > New policy > permitir INSERT/SELECT
 *    para o público (ou para usuários autenticados, dependendo de como
 *    vocês controlam quem pode cadastrar produto/empresa).
 */

const MAX_WIDTH = 1080; // suficiente para qualquer card/carrossel de cardápio
const JPEG_QUALITY = 0.75;

/**
 * Redimensiona e comprime a imagem no navegador antes do upload,
 * evitando subir fotos de 4-8 MB direto da câmera do celular.
 */
async function compressImage(file: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a imagem neste navegador.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem.'))),
            'image/jpeg',
            JPEG_QUALITY
        );
    });
}

/**
 * Converte uma data URL (ex: "data:image/jpeg;base64,...") em Blob,
 * para poder reaproveitar o mesmo pipeline de compressão + upload
 * quando a imagem já está em memória como base64 (preview do formulário,
 * inclusive depois de passar pelo "Estúdio de IA").
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return res.blob();
}

/**
 * Comprime e envia uma imagem para um bucket do Supabase Storage,
 * retornando a URL pública para salvar no registro (product.image,
 * company.logo, company.coverImage, etc).
 *
 * Aceita tanto um File (input type="file") quanto uma data URL base64
 * já carregada em memória.
 */
export async function uploadImage(
    fileOrDataUrl: File | string,
    bucket: 'products' | 'companies',
    pathPrefix: string // ex: companyId, ou `${companyId}/${productId}`
): Promise<string> {
    // Se já é uma URL http(s) (imagem não foi alterada), não há nada pra subir.
    if (typeof fileOrDataUrl === 'string' && /^https?:\/\//.test(fileOrDataUrl)) {
        return fileOrDataUrl;
    }

    const source = typeof fileOrDataUrl === 'string'
        ? await dataUrlToBlob(fileOrDataUrl)
        : fileOrDataUrl;

    const compressed = await compressImage(source);
    const fileName = `${pathPrefix}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, compressed, {
            contentType: 'image/jpeg',
            cacheControl: '31536000', // 1 ano — a URL muda a cada upload (timestamp no nome), então pode cachear forte
            upsert: false,
        });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
}

/** Atalho para imagem de produto. Aceita File ou data URL base64. */
export function uploadProductImage(fileOrDataUrl: File | string, companyId: string): Promise<string> {
    return uploadImage(fileOrDataUrl, 'products', companyId);
}

/** Atalho para logo/banner da loja. Aceita File ou data URL base64. */
export function uploadCompanyImage(fileOrDataUrl: File | string, companyId: string, kind: 'logo' | 'banner'): Promise<string> {
    return uploadImage(fileOrDataUrl, 'companies', `${companyId}-${kind}`);
}
