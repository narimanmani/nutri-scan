


export function createPageUrl(pageName: string) {
    return `/${pageName.trim().replace(/\s+/g, '-')}`;
}
