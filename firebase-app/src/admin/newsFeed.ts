import { Timestamp, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { firebaseAuth } from '@/lib/firebase/auth';
import { firestore } from '@/lib/firebase/db';
import type { NewsFeed } from '@/lib/news/feeds';
import type { KboKey, KboQuestion, KboSetKind } from '@/lib/kbo/set';
import { KBO_MAX_QUESTIONS } from '@/lib/kbo/set';
import { setFromData } from '@/lib/kbo/quiz';
import { loadKeys, saveSet } from './kbo';

/** 소식 가져오기(저장소 맨 위 docs/daily-kbo-quiz/05-news-feed.md) — 피드 설정·가져온 항목·실행 기록 */
const uid = () => firebaseAuth().currentUser!.uid;
const ms = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : Number(value ?? 0));

export async function loadFeeds(): Promise<NewsFeed[]> {
  const snapshot = await getDoc(doc(firestore(), 'adminConfig', 'newsFeeds'));
  return ((snapshot.get('feeds') as NewsFeed[] | undefined) ?? []).map((feed) => ({ ...feed, termsChecked: feed.termsChecked === true, enabled: feed.enabled === true }));
}

export async function saveFeeds(feeds: readonly NewsFeed[], action: string, target: string): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'adminConfig', 'newsFeeds'), { feeds: feeds.map((feed) => ({ ...feed })), updatedAt: serverTimestamp(), by: uid() });
  batch.set(doc(collection(db, 'adminLogs')), { by: uid(), action, target, detail: '', at: serverTimestamp() });
  await batch.commit();
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  summary: string;
  feedName: string;
  publishedAt: number;
}

/** 최근 항목. 읽기: 항목 수(최대 50) */
export async function loadItems(count = 50): Promise<NewsItem[]> {
  const snapshot = await getDocs(query(collection(firestore(), 'newsItems'), orderBy('publishedAt', 'desc'), limit(count)));
  return snapshot.docs.map((item) => ({
    id: item.id,
    title: String(item.get('title') ?? ''),
    link: String(item.get('link') ?? ''),
    summary: String(item.get('summary') ?? ''),
    feedName: String(item.get('feedName') ?? ''),
    publishedAt: ms(item.get('publishedAt')),
  }));
}

export interface FeedRun {
  at: number;
  added: number;
  removed: number;
  feeds: { id: string; name: string; status: string; items: number; added: number; reason?: string }[];
}

export async function loadFeedRuns(): Promise<FeedRun[]> {
  const snapshot = await getDoc(doc(firestore(), 'adminConfig', 'newsFeedRuns'));
  return (snapshot.get('runs') as FeedRun[] | undefined) ?? [];
}

/**
 * 묶음에 문항 하나를 더한다. 묶음이 없으면 "야구 소식 퀴즈"로 새로 만든다. 더하면 초안으로 돌아가 다시 승인해야 한다.
 * 공개된 묶음에는 더할 수 없다(시도의 문제 번호가 어긋난다).
 */
export async function appendToSet(setId: string, item: { question: KboQuestion; key: KboKey }): Promise<void> {
  const snapshot = await getDoc(doc(firestore(), 'kboSets', setId));
  if (!snapshot.exists()) {
    await saveSet(setId, 'news', '', [item], 'draft');
    return;
  }
  const set = setFromData(setId, snapshot.data());
  if (set.state !== 'draft' && Date.now() >= set.publishAt) throw new Error('공개된 묶음에는 더할 수 없어요.');
  if (set.kind !== 'news' && set.kind !== 'review' && set.kind !== 'quiz') throw new Error('안내 묶음에는 문항을 더할 수 없어요.');
  if (set.questions.length >= KBO_MAX_QUESTIONS) throw new Error(`한 묶음은 ${KBO_MAX_QUESTIONS}문항까지예요.`);
  const keys = await loadKeys(setId);
  const existing = set.questions.map((question, index) => ({ question, key: keys[index]! }));
  if (existing.some((entry) => !entry.key)) throw new Error('이 묶음의 정답 문서가 빠져 있어요.');
  await saveSet(setId, set.kind as KboSetKind, set.gamesDate, [...existing, item], 'draft');
}
