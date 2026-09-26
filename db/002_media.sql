-- Private evidence bucket. Only the server uses its secret key after resource authorization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('copy-evidence','copy-evidence',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
