query based on "match"

- order doesn't matter, the main thing matters is that query makes up a larger
  proportion of the text

1st - you can (2/5)
2nd - can you (2/5)
3rd - you can (2/6)

Searching for "you can"...
Search results:
{
video_id: 'kDyRZWexIK8',
startTime: 739680,
text: 'you can hear a helicopter',
score: 5.9584
}
{
video_id: 'kDyRZWexIK8',
startTime: 4071360,
text: 'can you hear the rain',
score: 5.9584
}
{
video_id: 'kDyRZWexIK8',
startTime: 3800800,
text: 'you can hear this crackling away',
score: 5.714227
}

---

query based on "match_phrase"

Searching for "you can"...
Search results:
{
video_id: 'kDyRZWexIK8',
startTime: 739680,
text: 'you can hear a helicopter',
score: 5.9584
}
{
video_id: 'kDyRZWexIK8',
startTime: 3800800,
text: 'you can hear this crackling away',
score: 5.714227
}
{
video_id: 'kDyRZWexIK8',
startTime: 4008640,
text: "because i don't think you can have enough",
score: 5.281371
}
{
video_id: 'kDyRZWexIK8',
startTime: 6403120,
text: 'very nice i hope you can hear me',
score: 5.281371
}
{
video_id: 'kDyRZWexIK8',
startTime: 3006080,
text: 'ages and it is brilliant because you can have all \n' +
'sorts of meals with it you can have soups in it ',
score: 5.2070894
}
