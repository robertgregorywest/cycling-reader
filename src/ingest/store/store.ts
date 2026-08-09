import type {
  Article,
  ArticleImage,
  SourceId,
  StoredArticle,
  StoredArticleImage,
} from '../../shared/article.ts'

/**
 * Where an Ingest Run writes. Two real implementations exist rather than one
 * plus a fake: the D1 HTTP client used in production, and the local SQLite
 * store used in tests and for manual inspection. Both run against the same
 * migration SQL, because a hand-written fake would let the tests pass while
 * the production SQL is wrong.
 */
export interface ArticleStore {
  /**
   * Which of these guids this Source already has Articles for. Asked once per
   * Source per run, so that admitting nothing new costs one query rather than
   * one per item.
   */
  knownGuids(source: SourceId, guids: readonly string[]): Promise<ReadonlySet<string>>

  /** Write a newly admitted Article and the images within it. */
  addArticle(article: Article, images: readonly ArticleImage[]): Promise<void>

  article(source: SourceId, guid: string): Promise<StoredArticle | null>

  images(source: SourceId, guid: string): Promise<readonly StoredArticleImage[]>
}
