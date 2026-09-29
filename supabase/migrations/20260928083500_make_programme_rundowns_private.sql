begin;

update storage.buckets
set public = false
where id = 'programme-rundowns';

commit;
