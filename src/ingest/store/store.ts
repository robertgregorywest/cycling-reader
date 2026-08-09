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
   * The Revision timestamp held against each of these guids this Source
   * already has an Article for, keyed by guid. A guid the store does not hold
   * is absent from the map, so one query answers both questions a Run asks of
   * an item: is it known, and has it been Revised since.
   *
   * Asked once per Source per run, so that admitting nothing new costs one
   * query rather than one per item.
   */
  knownRevisions(source: SourceId, guids: readonly string[]): Promise<ReadonlyMap<string, string>>

  /** Write a newly admitted Article and the images within it. */
  addArticle(article: Article, images: readonly ArticleImage[]): Promise<void>

  /**
   * Re-write an Article after a Revision: the columns the Source owns, and the
   * images within the new body in place of the ones the old body held.
   *
   * What the Source does not own is left alone — Read and Saved are the
   * reader's, and `published_at` and `first_seen_at` place the Article in the
   * index, where a Revision is not news and must not move it.
   */
  reviseArticle(article: Article, images: readonly ArticleImage[]): Promise<void>

  article(source: SourceId, guid: string): Promise<StoredArticle | null>

  images(source: SourceId, guid: string): Promise<readonly StoredArticleImage[]>
}
