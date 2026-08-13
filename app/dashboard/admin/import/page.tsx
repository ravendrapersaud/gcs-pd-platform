'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'

const REQUIRED_FIELDS = ['email', 'first_name', 'last_name']
const OPTIONAL_FIELDS = ['title', 'division', 'department', 'employee_id', 'employee_type', 'role', 'primary_supervisor_email', 'secondary_supervisor_email']

interface CsvRow {
  email: string
  first_name: string
  last_name: string
  title?: string
  division?: string
  department?: string
  employee_id?: string
  employee_type?: string
  role?: string
  [key: string]: string | undefined
}

interface ImportResult {
  created: number
  skipped: number
  errors: { row: number; email: string; error: string }[]
}

const TEMPLATE_CSV = [
  'employee_id,first_name,last_name,email,title,division,department,employee_type,role,primary_supervisor_email,secondary_supervisor_email',
  'EMP-100,Jane,Smith,jsmith@gcschool.org,Math Teacher,High School,Mathematics,faculty,staff,kchaloner@gcschool.org,',
  'EMP-101,Alex,Johnson,ajohnson@gcschool.org,Division Head,Middle School,Leadership,faculty,supervisor,kim@gcschool.org,',
  'EMP-102,Sam,Lee,slee@gcschool.org,IT Specialist,,Technology,staff,staff,ravendra@gcschool.org,',
].join('\n')

export default function ImportCsvPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const parseFile = useCallback((file: File) => {
    setParseError(null)
    setResult(null)
    setFileName(file.name)

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const missing = REQUIRED_FIELDS.filter(
          (f) => !results.meta.fields?.includes(f)
        )
        if (missing.length > 0) {
          setParseError(`Missing required columns: ${missing.join(', ')}`)
          setRows([])
          return
        }
        setRows(results.data)
      },
      error: (err) => {
        setParseError(err.message)
        setRows([])
      },
    })
  }, [])

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParseError('Only CSV files are accepted.')
      return
    }
    parseFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    setResult(null)

    const formData = new FormData()
    const blob = new Blob([Papa.unparse(rows)], { type: 'text/csv' })
    formData.append('file', blob, 'import.csv')

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/import-csv', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: formData,
      })
      const data: ImportResult = await res.json()
      setResult(data)
    } catch {
      setResult({ created: 0, skipped: 0, errors: [{ row: 0, email: '', error: 'Network error — please try again.' }] })
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gcs-staff-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Instructions */}
      <div className="card p-6 space-y-3">
        <h2 className="font-bold text-gray-900">Import Staff via CSV</h2>
        <p className="text-sm text-gray-600">
          Upload a CSV file to bulk-create staff accounts. Each row will create a new user in Supabase Auth and a corresponding profile.
        </p>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Required Columns</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {REQUIRED_FIELDS.map((f) => (
              <code key={f} className="bg-navy-100 text-navy-800 text-xs px-2 py-0.5 rounded font-mono">{f}</code>
            ))}
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Optional Columns</p>
          <div className="flex flex-wrap gap-2">
            {OPTIONAL_FIELDS.map((f) => (
              <code key={f} className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">{f}</code>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          <strong>Role values:</strong> <code>staff</code> (default), <code>supervisor</code>, <code>admin</code>
        </p>
        <p className="text-xs text-gray-500">
          <strong>Employee type values:</strong> <code>faculty</code>, <code>staff</code>, <code>admin</code> (Administration).
          Drives the fund-year reset — <code>admin</code> uses the staff window (July 1).
        </p>

        <button onClick={downloadTemplate} className="btn-secondary text-sm">
          ⬇ Download Template CSV
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-navy-500 bg-navy-50' : 'border-gray-300 hover:border-navy-400'
        }`}
      >
        <div className="text-4xl mb-3">📂</div>
        {fileName ? (
          <p className="font-medium text-navy-800">{fileName}</p>
        ) : (
          <>
            <p className="text-gray-600 font-medium">Drag & drop your CSV here</p>
            <p className="text-gray-400 text-sm mt-1">or click to browse</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </div>

      {parseError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {parseError}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !parseError && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <p className="font-semibold text-gray-900">{rows.length} row{rows.length !== 1 ? 's' : ''} ready to import</p>
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-primary text-sm"
            >
              {importing ? 'Importing…' : `Import ${rows.length} Staff Members`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['email', 'first_name', 'last_name', 'title', 'division', 'role'].map((col) => (
                    <th key={col} className="text-left px-4 py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-navy-800">{row.email}</td>
                    <td className="px-4 py-2 text-gray-700">{row.first_name}</td>
                    <td className="px-4 py-2 text-gray-700">{row.last_name}</td>
                    <td className="px-4 py-2 text-gray-500">{row.title ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{row.division ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className="badge badge-gray capitalize">{row.role ?? 'staff'}</span>
                    </td>
                  </tr>
                ))}
                {rows.length > 10 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-xs text-gray-400 italic">
                      + {rows.length - 10} more rows not shown in preview…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Import Results</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{result.created}</p>
              <p className="text-sm text-green-600 mt-1">Accounts Created</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-yellow-700">{result.skipped}</p>
              <p className="text-sm text-yellow-600 mt-1">Skipped (existing)</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-red-700 mb-2">Errors ({result.errors.length})</p>
              <ul className="space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-xs bg-red-50 text-red-700 rounded px-3 py-1.5">
                    Row {err.row}: <strong>{err.email}</strong> — {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
