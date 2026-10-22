// Real days from the pipeline's own data (20 Oct 2026), one per pattern, with job ids renumbered 1..n.
// Nothing here identifies a person or a Drive file. Titles, times, lengths and sizes are as recorded.
// "title" is the proposed title, or the YouTube title for a finished job.
import type { GroupInput } from "./autoReview";

export const TODAY = "22-10-2026";

export const cleanDay: GroupInput = {
  date: "12-10-2026",
  meetingCode: "uys-vqbk-mnn",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 12-10-2026",
      startTime: "18:00"
    },
    {
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 12-10-2026",
      startTime: "18:30"
    },
    {
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 12-10-2026",
      startTime: "19:00"
    },
    {
      title: "2.3 Siraji | Ustad Khalid Zaman | 12-10-2026",
      startTime: "19:30"
    },
    {
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 12-10-2026",
      startTime: "20:00"
    },
    {
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 12-10-2026",
      startTime: "20:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "needs_review",
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 12-10-2026",
      confirmed: false,
      createdTime: "2026-10-12T14:20:10.838Z",
      durationSec: 2982,
      sizeBytes: 331750275,
      contentType: "video"
    },
    {
      id: 2,
      status: "needs_review",
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 12-10-2026",
      confirmed: false,
      createdTime: "2026-10-12T14:42:31.096Z",
      durationSec: 1887,
      sizeBytes: 235880509,
      contentType: "video"
    },
    {
      id: 3,
      status: "needs_review",
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 12-10-2026",
      confirmed: false,
      createdTime: "2026-10-12T15:09:02.383Z",
      durationSec: 771,
      sizeBytes: 63223467,
      contentType: "video"
    },
    {
      id: 4,
      status: "needs_review",
      title: "2.3 Siraji | Ustad Khalid Zaman | 12-10-2026",
      confirmed: false,
      createdTime: "2026-10-12T16:24:42.542Z",
      durationSec: 1487,
      sizeBytes: 178177224,
      contentType: "video"
    },
    {
      id: 5,
      status: "needs_review",
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 12-10-2026",
      confirmed: false,
      createdTime: "2026-10-12T16:54:36.241Z",
      durationSec: 2368,
      sizeBytes: 223307127,
      contentType: "video"
    },
    {
      id: 6,
      status: "needs_review",
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 12-10-2026",
      confirmed: false,
      createdTime: "2026-10-12T17:27:43.201Z",
      durationSec: 1536,
      sizeBytes: 157036873,
      contentType: "video"
    }
  ]
};

export const outOfOrderDay: GroupInput = {
  date: "14-07-2026",
  meetingCode: "uys-vqbk-mnn",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 14-07-2026",
      startTime: "18:00"
    },
    {
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 14-07-2026",
      startTime: "18:30"
    },
    {
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 14-07-2026",
      startTime: "19:00"
    },
    {
      title: "5.2 Falakiyat | Ustad Khalid Zaman | 14-07-2026",
      startTime: "19:30"
    },
    {
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 14-07-2026",
      startTime: "20:00"
    },
    {
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 14-07-2026",
      startTime: "20:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "done",
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 14-07-2026",
      confirmed: false,
      createdTime: "2026-07-14T13:45:45.754Z",
      durationSec: 540,
      sizeBytes: 105340192,
      contentType: "video"
    },
    {
      id: 2,
      status: "done",
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 14-07-2026",
      confirmed: false,
      createdTime: "2026-07-14T14:18:00.251Z",
      durationSec: 652,
      sizeBytes: 63695215,
      contentType: "video"
    },
    {
      id: 3,
      status: "done",
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 14-07-2026",
      confirmed: false,
      createdTime: "2026-07-14T15:18:51.545Z",
      durationSec: 1594,
      sizeBytes: 196370575,
      contentType: "video"
    },
    {
      id: 4,
      status: "done",
      title: "2.3 Siraji | Ustad Khalid Zaman | 14-07-2026",
      confirmed: false,
      createdTime: "2026-07-14T15:33:30.754Z",
      durationSec: 1403,
      sizeBytes: 162284742,
      contentType: "video"
    },
    {
      id: 5,
      status: "done",
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 14-07-2026",
      confirmed: false,
      createdTime: "2026-07-14T15:58:25.815Z",
      durationSec: 1743,
      sizeBytes: 207085061,
      contentType: "video"
    },
    {
      id: 6,
      status: "done",
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 14-07-2026",
      confirmed: false,
      createdTime: "2026-07-14T16:26:19.234Z",
      durationSec: 1568,
      sizeBytes: 245536683,
      contentType: "video"
    }
  ]
};

export const skippedClassDay: GroupInput = {
  date: "09-10-2026",
  meetingCode: "zeo-iaqz-qqu",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 09-10-2026",
      startTime: "18:00"
    },
    {
      title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 09-10-2026",
      startTime: "18:30"
    },
    {
      title: "2.2 Kitab ul Asar | Ustad Haseeb | 09-10-2026",
      startTime: "19:00"
    },
    {
      title: "1.3 Jalalain Part 3 | Ustad Wasimullah | 09-10-2026",
      startTime: "19:30"
    },
    {
      title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 09-10-2026",
      startTime: "20:00"
    },
    {
      title: "3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 09-10-2026",
      startTime: "20:30"
    },
    {
      title: "6.2 Dewan Hamasa | Ustad Faraz | 09-10-2026",
      startTime: "21:00"
    },
    {
      title: "5.1 Sharah Aqaid | Ustad Khalid Zaman | 09-10-2026",
      startTime: "21:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "needs_review",
      title: "3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 09-10-2026",
      confirmed: false,
      createdTime: "2026-10-09T13:49:00.486Z",
      durationSec: 1255,
      sizeBytes: 132066570,
      contentType: "video"
    },
    {
      id: 2,
      status: "needs_review",
      title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 09-10-2026",
      confirmed: false,
      createdTime: "2026-10-09T14:41:29.759Z",
      durationSec: 1550,
      sizeBytes: 148379455,
      contentType: "video"
    },
    {
      id: 3,
      status: "needs_review",
      title: "2.2 Kitab ul Asar | Ustad Haseeb | 09-10-2026",
      confirmed: false,
      createdTime: "2026-10-09T14:56:39.672Z",
      durationSec: 1719,
      sizeBytes: 179694884,
      contentType: "video"
    },
    {
      id: 4,
      status: "needs_review",
      title: "1.3 Jalalain Part 3 | Ustad Wasimullah | 09-10-2026",
      confirmed: false,
      createdTime: "2026-10-09T15:58:47.052Z",
      durationSec: 984,
      sizeBytes: 123180646,
      contentType: "video"
    },
    {
      id: 5,
      status: "needs_review",
      title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 09-10-2026",
      confirmed: false,
      createdTime: "2026-10-09T16:31:37.458Z",
      durationSec: 500,
      sizeBytes: 44090602,
      contentType: "video"
    },
    {
      id: 6,
      status: "needs_review",
      title: "3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 09-10-2026",
      confirmed: false,
      createdTime: "2026-10-09T18:08:55.324Z",
      durationSec: 1599,
      sizeBytes: 141502582,
      contentType: "video"
    }
  ]
};

export const extraFileDay: GroupInput = {
  date: "05-10-2026",
  meetingCode: "uys-vqbk-mnn",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 05-10-2026",
      startTime: "18:00"
    },
    {
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 05-10-2026",
      startTime: "18:30"
    },
    {
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 05-10-2026",
      startTime: "19:00"
    },
    {
      title: "2.3 Siraji | Ustad Khalid Zaman | 05-10-2026",
      startTime: "19:30"
    },
    {
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 05-10-2026",
      startTime: "20:00"
    },
    {
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 05-10-2026",
      startTime: "20:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "needs_review",
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 05-10-2026",
      confirmed: false,
      createdTime: "2026-10-05T14:42:16.455Z",
      durationSec: 3117,
      sizeBytes: 394296916,
      contentType: "video"
    },
    {
      id: 2,
      status: "needs_review",
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 05-10-2026",
      confirmed: false,
      createdTime: "2026-10-05T14:56:27.953Z",
      durationSec: 2026,
      sizeBytes: 220864812,
      contentType: "video"
    },
    {
      id: 3,
      status: "needs_review",
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 05-10-2026",
      confirmed: false,
      createdTime: "2026-10-05T14:59:42.262Z",
      durationSec: 1313,
      sizeBytes: 97805559,
      contentType: "video"
    },
    {
      id: 4,
      status: "needs_review",
      title: "2.3 Siraji | Ustad Khalid Zaman | 05-10-2026",
      confirmed: false,
      createdTime: "2026-10-05T15:36:13.805Z",
      durationSec: 1755,
      sizeBytes: 193825882,
      contentType: "video"
    },
    {
      id: 5,
      status: "needs_review",
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 05-10-2026",
      confirmed: false,
      createdTime: "2026-10-05T16:06:59.876Z",
      durationSec: 1761,
      sizeBytes: 156344443,
      contentType: "video"
    },
    {
      id: 6,
      status: "needs_review",
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 05-10-2026",
      confirmed: false,
      createdTime: "2026-10-05T16:34:19.046Z",
      durationSec: 1889,
      sizeBytes: 176574785,
      contentType: "video"
    },
    {
      id: 7,
      status: "needs_review",
      title: "uys-vqbk-mnn (2026-10-05 17:24 GMT+5)",
      confirmed: false,
      createdTime: "2026-10-05T16:55:00.504Z",
      durationSec: 1076,
      sizeBytes: 244928854,
      contentType: "video"
    }
  ]
};

export const splitDay: GroupInput = {
  date: "06-07-2026",
  meetingCode: "uys-vqbk-mnn",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 06-07-2026",
      startTime: "18:00"
    },
    {
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 06-07-2026",
      startTime: "18:30"
    },
    {
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 06-07-2026",
      startTime: "19:00"
    },
    {
      title: "2.3 Siraji | Ustad Khalid Zaman | 06-07-2026",
      startTime: "19:30"
    },
    {
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 06-07-2026",
      startTime: "20:00"
    },
    {
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 06-07-2026",
      startTime: "20:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "done",
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 06-07-2026",
      confirmed: false,
      createdTime: "2026-07-06T14:04:43.818Z",
      durationSec: 1564,
      sizeBytes: 265814465,
      contentType: "video"
    },
    {
      id: 2,
      status: "done",
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 06-07-2026",
      confirmed: false,
      createdTime: "2026-07-06T14:37:21.840Z",
      durationSec: 1744,
      sizeBytes: 206243145,
      contentType: "video"
    },
    {
      id: 3,
      status: "done",
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 06-07-2026",
      confirmed: false,
      createdTime: "2026-07-06T15:03:07.229Z",
      durationSec: 1352,
      sizeBytes: 126659944,
      contentType: "video"
    },
    {
      id: 4,
      status: "rejected",
      title: "2.3 Siraji | Ustad Khalid Zaman | 06-07-2026 | Part 1",
      confirmed: false,
      createdTime: "2026-07-06T15:24:55.227Z",
      durationSec: 197,
      sizeBytes: 25654780,
      contentType: "video"
    },
    {
      id: 5,
      status: "done",
      title: "2.3 Siraji | Ustad Khalid Zaman | 06-07-2026 | Part 2",
      confirmed: false,
      createdTime: "2026-07-06T15:35:50.319Z",
      durationSec: 1268,
      sizeBytes: 153780334,
      contentType: "video"
    },
    {
      id: 6,
      status: "done",
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 06-07-2026",
      confirmed: false,
      createdTime: "2026-07-06T15:52:14.360Z",
      durationSec: 966,
      sizeBytes: 121795556,
      contentType: "video"
    },
    {
      id: 7,
      status: "done",
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 06-07-2026",
      confirmed: false,
      createdTime: "2026-07-06T16:39:52.943Z",
      durationSec: 1759,
      sizeBytes: 304211081,
      contentType: "video"
    }
  ]
};

export const shortRecordingDay: GroupInput = {
  date: "17-10-2026",
  meetingCode: "zeo-iaqz-qqu",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 17-10-2026",
      startTime: "18:00"
    },
    {
      title: "5.1 Sharah Aqaid | Ustad Khalid Zaman | 17-10-2026",
      startTime: "18:30"
    },
    {
      title: "1.3 Jalalain Part 3 | Ustad Wasimullah | 17-10-2026",
      startTime: "19:00"
    },
    {
      title: "2.2 Kitab ul Asar | Ustad Haseeb | 17-10-2026",
      startTime: "19:30"
    },
    {
      title: "3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 17-10-2026",
      startTime: "20:00"
    },
    {
      title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 17-10-2026",
      startTime: "20:30"
    },
    {
      title: "6.2 Dewan Hamasa | Ustad Faraz | 17-10-2026",
      startTime: "21:00"
    },
    {
      title: "3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 17-10-2026",
      startTime: "21:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "needs_review",
      title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T13:49:58.063Z",
      durationSec: 840,
      sizeBytes: 92618308,
      contentType: "video"
    },
    {
      id: 2,
      status: "needs_review",
      title: "5.1 Sharah Aqaid | Ustad Khalid Zaman | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T14:38:14.082Z",
      durationSec: 1666,
      sizeBytes: 136133960,
      contentType: "video"
    },
    {
      id: 3,
      status: "needs_review",
      title: "1.3 Jalalain Part 3 | Ustad Wasimullah | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T14:43:38.793Z",
      durationSec: 1428,
      sizeBytes: 140368634,
      contentType: "video"
    },
    {
      id: 4,
      status: "needs_review",
      title: "2.2 Kitab ul Asar | Ustad Haseeb | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T15:17:21.878Z",
      durationSec: 1142,
      sizeBytes: 97640030,
      contentType: "video"
    },
    {
      id: 5,
      status: "needs_review",
      title: "3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T15:53:47.074Z",
      durationSec: 1849,
      sizeBytes: 165192210,
      contentType: "video"
    },
    {
      id: 6,
      status: "needs_review",
      title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T16:15:33.767Z",
      durationSec: 157,
      sizeBytes: 17221044,
      contentType: "video"
    },
    {
      id: 7,
      status: "needs_review",
      title: "6.2 Dewan Hamasa | Ustad Faraz | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T17:15:18.292Z",
      durationSec: 1866,
      sizeBytes: 249193223,
      contentType: "video"
    },
    {
      id: 8,
      status: "needs_review",
      title: "3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 17-10-2026",
      confirmed: false,
      createdTime: "2026-10-17T17:53:54.770Z",
      durationSec: 1889,
      sizeBytes: 189253880,
      contentType: "video"
    }
  ]
};

export const overlapDay: GroupInput = {
  date: "20-10-2026",
  meetingCode: "uys-vqbk-mnn",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 20-10-2026",
      startTime: "18:00"
    },
    {
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 20-10-2026",
      startTime: "18:30"
    },
    {
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 20-10-2026",
      startTime: "19:00"
    },
    {
      title: "5.2 Falakiyat | Ustad Khalid Zaman | 20-10-2026",
      startTime: "19:30"
    },
    {
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 20-10-2026",
      startTime: "20:00"
    },
    {
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 20-10-2026",
      startTime: "20:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "needs_review",
      title: "4.2 Tawzeeh Part 2 | Ustad Saeedur Rahman | 20-10-2026",
      confirmed: false,
      createdTime: "2026-10-20T14:16:39.718Z",
      durationSec: 613,
      sizeBytes: 82977693,
      contentType: "video"
    },
    {
      id: 2,
      status: "needs_review",
      title: "6.1 Matan ul Kafi | Ustad Aamir Iqbal | 20-10-2026",
      confirmed: false,
      createdTime: "2026-10-20T14:30:15.479Z",
      durationSec: 1320,
      sizeBytes: 91165198,
      contentType: "video"
    },
    {
      id: 3,
      status: "needs_review",
      title: "1.2 Jalalain Part 2 | Ustad Haseeb | 20-10-2026",
      confirmed: false,
      createdTime: "2026-10-20T14:38:26.613Z",
      durationSec: 2143,
      sizeBytes: 262926004,
      contentType: "video"
    },
    {
      id: 4,
      status: "needs_review",
      title: "5.2 Falakiyat | Ustad Khalid Zaman | 20-10-2026",
      confirmed: false,
      createdTime: "2026-10-20T15:02:52.173Z",
      durationSec: 1605,
      sizeBytes: 205657662,
      contentType: "video"
    },
    {
      id: 5,
      status: "needs_review",
      title: "2.1 Al Fawz ul Kabir | Ustad Haseeb | 20-10-2026",
      confirmed: false,
      createdTime: "2026-10-20T16:15:14.375Z",
      durationSec: 1236,
      sizeBytes: 112345291,
      contentType: "video"
    },
    {
      id: 6,
      status: "needs_review",
      title: "3.3 Hidaya Sani Part 3 | Ustad Aslam Shah | 20-10-2026",
      confirmed: false,
      createdTime: "2026-10-20T16:59:52.372Z",
      durationSec: 2053,
      sizeBytes: 261391505,
      contentType: "video"
    }
  ]
};

export const edgeDurationDay: GroupInput = {
  date: "13-06-2026",
  meetingCode: "zeo-iaqz-qqu",
  today: TODAY,
  otherTitles: [],
  slots: [
    {
      title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 13-06-2026",
      startTime: "18:00"
    },
    {
      title: "5.1 Sharah Aqaid | Ustad Khalid Zaman | 13-06-2026",
      startTime: "18:30"
    },
    {
      title: "1.3 Jalalain Part 3 | Ustad Wasimullah | 13-06-2026",
      startTime: "19:00"
    },
    {
      title: "2.2 Kitab ul Asar | Ustad Haseeb | 13-06-2026",
      startTime: "19:30"
    },
    {
      title: "3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 13-06-2026",
      startTime: "20:00"
    },
    {
      title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 13-06-2026",
      startTime: "20:30"
    },
    {
      title: "6.2 Dewan Hamasa | Ustad Faraz | 13-06-2026",
      startTime: "21:00"
    },
    {
      title: "3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 13-06-2026",
      startTime: "21:30"
    }
  ],
  files: [
    {
      id: 1,
      status: "done",
      title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T13:52:10.903Z",
      durationSec: 1646,
      sizeBytes: 109446066,
      contentType: "video"
    },
    {
      id: 2,
      status: "done",
      title: "5.1 Sharah Aqaid | Ustad Khalid Zaman | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T14:15:16.517Z",
      durationSec: 1699,
      sizeBytes: 99863938,
      contentType: "video"
    },
    {
      id: 3,
      status: "done",
      title: "1.3 Jalalain Part 3 | Ustad Wasimullah | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T14:19:58.402Z",
      durationSec: 393,
      sizeBytes: 29757586,
      contentType: "video"
    },
    {
      id: 4,
      status: "done",
      title: "2.2 Kitab ul Asar | Ustad Haseeb | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T15:29:36.021Z",
      durationSec: 1543,
      sizeBytes: 84966059,
      contentType: "video"
    },
    {
      id: 5,
      status: "done",
      title: "3.1 Hidaya Sani Part 1 | Ustad Sirajul Haq | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T15:40:19.013Z",
      durationSec: 1293,
      sizeBytes: 82456697,
      contentType: "video"
    },
    {
      id: 6,
      status: "done",
      title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T16:20:40.678Z",
      durationSec: 1681,
      sizeBytes: 310952401,
      contentType: "video"
    },
    {
      id: 7,
      status: "done",
      title: "6.2 Dewan Hamasa | Ustad Faraz | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T16:40:23.344Z",
      durationSec: 1153,
      sizeBytes: 115639022,
      contentType: "video"
    },
    {
      id: 8,
      status: "done",
      title: "3.2 Hidaya Sani Part 2 | Ustad Saeedur Rahman | 13-06-2026",
      confirmed: false,
      createdTime: "2026-06-13T17:40:15.004Z",
      durationSec: 2368,
      sizeBytes: 198384429,
      contentType: "video"
    }
  ]
};

