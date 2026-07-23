// ── Google Drive picker helpers ───────────────────────────────
// Loads the Google Picker at runtime via script tags (no npm deps).
// Requires NEXT_PUBLIC_GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_CLIENT_ID;
// if either is missing, openDrivePicker throws Error('picker-not-configured')
// so the UI can fall back to a paste-a-link form.

import type { DriveIconType } from '@/lib/types'

declare global {
  // Loaded at runtime from Google's script tags — typed loosely on purpose.
  interface Window {
    gapi: any
    google: any
  }
}

export interface PickedDriveFile {
  name: string
  url: string
  iconType: string
}

// Derive an icon type from a pasted / stored URL.
export function driveIconFromUrl(url: string): DriveIconType {
  const u = url.toLowerCase()
  if (u.includes('docs.google.com/document')) return 'doc'
  if (u.includes('docs.google.com/spreadsheets')) return 'sheet'
  if (u.includes('docs.google.com/presentation')) return 'slide'
  if (u.includes('docs.google.com/forms') || u.includes('forms.gle')) return 'form'
  if (u.split('?')[0].split('#')[0].endsWith('.pdf')) return 'pdf'
  return 'file'
}

// Derive an icon type from a Drive mimeType (picker results).
function driveIconFromMime(mime: string): DriveIconType {
  if (mime === 'application/vnd.google-apps.document') return 'doc'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'sheet'
  if (mime === 'application/vnd.google-apps.presentation') return 'slide'
  if (mime === 'application/vnd.google-apps.form') return 'form'
  if (mime === 'application/pdf') return 'pdf'
  return 'file'
}

// Load an external script once; resolves when it's ready.
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)))
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

export async function openDrivePicker(
  onPick: (file: PickedDriveFile) => void
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!apiKey || !clientId) throw new Error('picker-not-configured')

  await Promise.all([
    loadScript('https://apis.google.com/js/api.js'),
    loadScript('https://accounts.google.com/gsi/client'),
  ])

  // 1. OAuth token via Google Identity Services
  const accessToken: string = await new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp: any) => {
          if (resp?.access_token) resolve(resp.access_token)
          else reject(new Error(resp?.error ?? 'Google sign-in failed'))
        },
        error_callback: (err: any) =>
          reject(new Error(err?.type ?? 'Google sign-in failed')),
      })
      tokenClient.requestAccessToken()
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Google sign-in failed'))
    }
  })

  // 2. Load the picker module
  await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))

  // 3. Build and show the picker
  await new Promise<void>((resolve) => {
    const google = window.google
    // List mode instead of the thumbnail grid: with the narrow drive.file
    // scope the picker can't render file previews, so grid thumbnails
    // appear broken. List view shows name/icon/date cleanly.
    const view = new google.picker.DocsView()
      .setIncludeFolders(false)
      .setMode(google.picker.DocsViewMode.LIST)
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0]
          if (doc) {
            onPick({
              name: doc.name ?? 'Untitled',
              url: doc.url ?? `https://drive.google.com/file/d/${doc.id}/view`,
              iconType: driveIconFromMime(doc.mimeType ?? ''),
            })
          }
          resolve()
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve()
        }
      })
      .build()
    picker.setVisible(true)
  })
}
