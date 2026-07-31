const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { Resend } = require('resend');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const resend = new Resend(process.env.RESEND_API_KEY);


// POST /api/requests — new consultation request from the form
router.post('/', async (req, res) => {
    const { fullName, email, eventType, preferredDate, preferredTime, backupDate, location, notes} = req.body;
    const { data, error } = await supabase
        .from('consultation_requests')
        .insert({
            full_name: fullName,
            email,
            event_type: eventType,
            preferred_date: preferredDate,
            preferred_time: preferredTime || null,
            backup_date: backupDate || null,
            location,
            notes,
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    const link = `${process.env.CLIENT_URL}/status/${data.id}`;
    try {
        console.log("SENDING NEW BOOKING EMAIL...");

        const emailResponse = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: "amusaabdullah1234@gmail.com",
            subject: 'New Booking Request 💄',
            html: `
                <h2>New Booking Request</h2>
                <p><strong>Name:</strong> ${fullName}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Event:</strong> ${eventType}</p>
                <p><strong>Date:</strong> ${preferredDate}</p>
                <p><strong>Time:</strong> ${preferredTime || 'Not specified'}</p>
                <p><strong>Location:</strong> ${location}</p>
                <p><strong>Notes:</strong> ${notes || 'None'}</p>
            `,
        });

        console.log("BOOKING EMAIL SENT:", emailResponse);

    } catch (emailError) {
        console.error("BOOKING EMAIL ERROR:", emailError);
        // ❗ don't break the request if email fails
    }
    
    res.status(201).json({ success: true, request: data });
});

// GET /api/requests — admin dashboard list
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('consultation_requests')
        .select('*, request_messages(*)')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// GET /api/requests/:id — one request, with message history
router.get('/:id', async (req, res) => {
    const { data, error } = await supabase
        .from('consultation_requests')
        .select('*, request_messages(*)')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(404).json({ error: 'Request not found' });
    res.json(data);
});

// PATCH /api/requests/:id/status — update status only
router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;

    const { data, error } = await supabase
        .from('consultation_requests')
        .update({ status })
        .eq('id', req.params.id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, request: data });
});

router.patch('/:id/reply', async (req, res) => {
    const { message, newStatus } = req.body;
    const { id } = req.params;

    const link = `${process.env.CLIENT_URL}/status/${id}`;

    try {
        const { data: request, error: fetchError } = await supabase
            .from('consultation_requests')
            .select('email, full_name')
            .eq('id', id)
            .single();

        if (fetchError) return res.status(404).json({ error: 'Request not found' });

        try {
            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: request.email,
                subject: 'Reply to your consultation ✨',
                html: `<p>Hi ${request.full_name},</p> 
                <p>${message}</p> 
                <a href="${link}" 
                style="background:#d63384;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">
                View your booking
                </a>`,
            });
        } catch (emailError) {
            console.error('Resend error (reply):', emailError);
            return res.status(500).json({ error: 'Email failed to send' });
        }

        const { error: insertError } = await supabase
            .from('request_messages')
            .insert({ request_id: id, body: message, sender: 'admin' });

        if (insertError) return res.status(500).json({ error: insertError.message });

        if (newStatus) {
            await supabase.from('consultation_requests').update({ status: newStatus }).eq('id', id);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error in /reply route:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/requests/:id/message — client sends a message (optionally with image), notifies admin
router.post('/:id/message', upload.single('image'), async (req, res) => {
    try {
        const { message } = req.body;
        const { id } = req.params;
        let imageUrl = null;

        if (req.file) {
            const fileName = `${id}-${Date.now()}-${req.file.originalname}`;

            const { error: uploadError } = await supabase.storage
                .from('message-attachments')
                .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

            if (uploadError) return res.status(500).json({ error: uploadError.message });

            const { data: publicUrlData } = supabase.storage
                .from('message-attachments')
                .getPublicUrl(fileName);

            imageUrl = publicUrlData.publicUrl;
        }

        const { error } = await supabase
            .from('request_messages')
            .insert({ request_id: id, body: message || '', sender: 'client', image_url: imageUrl });

        if (error) return res.status(500).json({ error: error.message });

        // Notify admin — don't fail the request if this email fails
        console.log("ABOUT TO SEND EMAIL");

        try {
           const emailResponse = await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: "amusaabdullah1234@gmail.com",
                subject: 'New message from client 💄',
                html: `
                    <p>New message on request <strong>${id}</strong>:</p>
                    <p>${message || '(no text)'}</p>
                    ${imageUrl ? `<p><a href="${imageUrl}">View attached image</a></p>` : ''}
                `,
            });

            console.log("RESEND RESPONSE:", emailResponse);

        } catch (emailError) {
            console.error("FULL RESEND ERROR:", emailError);
            return res.status(500).json({
                error: "Email failed",
                details: emailError.message
            });
        }
        res.status(201).json({ success: true });

    } catch (err) {
        console.error('Error in /message route:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    const { error } = await supabase
        .from('consultation_requests')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

module.exports = router;