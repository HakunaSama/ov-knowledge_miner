import * as React from 'react'
import {
  ArchiveRestoreIcon,
  LinkIcon,
  LoaderCircleIcon,
  TerminalIcon,
  UploadCloudIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'

export function CliResultImportCard({
  busy,
  discoveredCount,
  onAttachUri,
  onImportOvpack,
}: {
  busy: boolean
  discoveredCount: number
  onAttachUri: (uri: string) => void
  onImportOvpack: (file: File) => void
}) {
  const { t } = useTranslation('knowledgeMining')
  const [targetUri, setTargetUri] = React.useState('')
  const ovpackInputRef = React.useRef<HTMLInputElement>(null)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TerminalIcon className="size-4" />
              {t('cliImport.title')}
            </CardTitle>
            <CardDescription className="mt-1.5">
              {t('cliImport.description')}
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {t('cliImport.discoveredBadge', { count: discoveredCount })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border bg-primary/[0.03] p-4">
            <div className="flex items-start gap-3">
              <TerminalIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {t('cliImport.discovery.title')}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('cliImport.discovery.description')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <LinkIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {t('cliImport.uri.title')}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('cliImport.uri.description')}
                </p>
              </div>
            </div>
            <Input
              value={targetUri}
              disabled={busy}
              aria-label={t('cliImport.uri.label')}
              placeholder={t('cliImport.uri.placeholder')}
              onChange={(event) => setTargetUri(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && targetUri.trim() && !busy) {
                  onAttachUri(targetUri)
                }
              }}
            />
            <Button
              className="w-full"
              variant="outline"
              disabled={busy || !targetUri.trim()}
              onClick={() => onAttachUri(targetUri)}
            >
              {busy ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <LinkIcon />
              )}
              {t('cliImport.uri.action')}
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <ArchiveRestoreIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {t('cliImport.ovpack.title')}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('cliImport.ovpack.description')}
                </p>
              </div>
            </div>
            <code className="block rounded-md bg-muted px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              {t('cliImport.ovpack.command')}
            </code>
            <input
              ref={ovpackInputRef}
              className="hidden"
              type="file"
              accept=".ovpack,application/zip"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) onImportOvpack(file)
                event.currentTarget.value = ''
              }}
            />
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => ovpackInputRef.current?.click()}
            >
              {busy ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <UploadCloudIcon />
              )}
              {t('cliImport.ovpack.action')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
