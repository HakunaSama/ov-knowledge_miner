import * as React from 'react'
import { NetworkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { KnowledgeGraphData } from '../-lib/knowledge-graph'
import { renderOfficialKnowledgeGraphHtml } from '../-lib/official-knowledge-graph'

export function KnowledgeCloudGraph({
  graph,
  sourceName,
}: {
  graph: KnowledgeGraphData
  sourceName: string
}) {
  const { t } = useTranslation('knowledgeMining')
  const document = React.useMemo(
    () =>
      renderOfficialKnowledgeGraphHtml({
        graph,
        sourceName,
        title: t('graph.title'),
      }),
    [graph, sourceName, t],
  )

  if (graph.nodes.length === 0) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center rounded-xl border bg-muted/15 text-center">
        <NetworkIcon className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold">{t('graph.emptyTitle')}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
          {t('graph.emptyDescription')}
        </p>
      </div>
    )
  }

  return (
    <iframe
      className="h-[760px] w-full rounded-xl border bg-slate-950"
      sandbox="allow-scripts"
      srcDoc={document}
      title={t('graph.title')}
    />
  )
}
