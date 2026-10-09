import { describe, expect, it } from 'vitest';
import { PageCursor } from '../src/utils/pagination/PageCursor';

describe('PageCursor', () => {
    it('always has at least one page', () => {
        expect(new PageCursor(0, 5).totalPages).toBe(1);
        expect(new PageCursor(11, 5).totalPages).toBe(3);
    });

    it('moves within bounds and slices the current page', () => {
        const cursor = new PageCursor(7, 3);
        const items = [ 1, 2, 3, 4, 5, 6, 7 ];

        expect(cursor.previous()).toBe(false);
        expect(cursor.slice(items)).toEqual([ 1, 2, 3 ]);
        expect(cursor.next()).toBe(true);
        expect(cursor.slice(items)).toEqual([ 4, 5, 6 ]);
        expect(cursor.next()).toBe(true);
        expect(cursor.slice(items)).toEqual([ 7 ]);
        expect(cursor.next()).toBe(false);
        expect(cursor.view).toEqual({ page: 3, totalPages: 3, totalItems: 7 });
    });

    it('keeps the page valid when the list shrinks', () => {
        const cursor = new PageCursor(10, 5);
        cursor.goTo(1);

        cursor.resize(3);

        expect(cursor.currentPage).toBe(0);
        expect(cursor.pageOf(7)).toBe(1);
    });
});
