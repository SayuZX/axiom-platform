'use client';
import { createContext } from 'react';
import { adminPanelHref } from '../../lib/admin-navigation.mjs';
export const AdminEmbed = createContext(false);
const browserRouter = { replace: href => window.location.replace(adminPanelHref(href)), push: href => window.location.assign(adminPanelHref(href)) };
export function useAdminRouter() { return browserRouter; }
export function AdminLink({ href, children, prefetch, replace, scroll, ...props }) {
  return <a {...props} href={adminPanelHref(href)}>{children}</a>;
}
